"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { type ActionResult } from "@/lib/validation";
import { adoptAnonymousShield } from "@/lib/adopt-progress";
import { MAGIC_LINK_DISABLED, logAuthError, reportAuthError } from "@/lib/auth-errors";
import { authCallbackUrl } from "@/lib/auth-callback";
import { honeypotTripped } from "@/lib/honeypot";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";
import { clientIp, hashIp } from "@/lib/client-ip";
import { PASSWORD_RESET_PATH, clearRecoveryMarker } from "@/lib/recovery";
import { MAGIC_LINK_ENABLED, PASSWORD_RESET_ENABLED } from "@/lib/auth-features";

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Passwords are at least 8 characters."),
});

const newPassword = z
  .object({
    password: z.string().min(8, "Passwords are at least 8 characters."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Those two passwords do not match.",
    path: ["confirm"],
  });

/** The one place a form's Turnstile token is read and checked. */
async function humanCheck(formData: FormData): Promise<ActionResult | null> {
  const ip = await clientIp();
  const result = await verifyTurnstile(String(formData.get(TURNSTILE_FIELD) ?? "") || null, ip);
  return result.ok ? null : { ok: false, error: "That did not look like a person. Reload the page and try again." };
}

export async function signIn(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const blocked = await humanCheck(formData);
  if (blocked) return blocked;

  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: reportAuthError("signIn", error) };

  redirect(String(formData.get("next") ?? "/feed"));
}

export async function signUp(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  // The same answer a real signup gets, so a bot cannot tell it was caught.
  if (honeypotTripped(formData)) return { ok: true, data: undefined };

  const blocked = await humanCheck(formData);
  if (blocked) return blocked;

  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  // Per IP limit, five an hour, counted in Postgres by migration 0012. The address
  // is hashed before it leaves this process and the table holds nothing else.
  const ip = await clientIp();
  if (ip) {
    const limiter = await createSupabaseServerClient();
    const { data: allowed, error: limitError } = await limiter.rpc("record_signup_attempt", {
      p_ip_hash: hashIp(ip),
    });

    if (limitError) {
      logAuthError("recordSignupAttempt", limitError);
    } else if (allowed === false) {
      return { ok: false, error: "Too many accounts from this connection. Try again in an hour." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: await authCallbackUrl() },
  });

  if (error) return { ok: false, error: reportAuthError("signUp", error) };
  if (!data.session || !data.user) return { ok: true, data: undefined };

  // Whatever level they picked as a guest follows them into the account.
  await adoptAnonymousShield(supabase, data.user.id);

  redirect("/onboarding");
}

/**
 * Magic link sign in. **DISABLED September 2026 pending SMTP.**
 *
 * The implementation below is intact and deliberately not deleted. What is gone is
 * the way in: the "Or get a sign in link" form was removed from
 * components/form/AuthForm.tsx, which is what app/auth/sign-in renders, and
 * MAGIC_LINK_ENABLED in lib/auth-features.ts is false so a stray post to this
 * action from a cached page, a bookmarked form, or a script does nothing at all.
 *
 * To re-enable, both: flip MAGIC_LINK_ENABLED to true, and restore the form in
 * app/auth/sign-in. Flipping the flag alone gives nobody a way to reach this, and
 * restoring the form alone hits the guard below.
 *
 * The tests in tests/unit/auth-actions.test.ts mock the flag to true and still
 * exercise the whole path, so this does not rot while it is switched off.
 */
export async function sendMagicLink(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  // Before anything else, including Supabase and the honeypot. Nothing is sent,
  // nothing is logged, and no rate limit is spent.
  if (!MAGIC_LINK_ENABLED) return { ok: false, error: MAGIC_LINK_DISABLED };

  if (honeypotTripped(formData)) return { ok: true, data: undefined };

  const email = z.string().trim().email().safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { ok: false, error: "Enter a valid email address." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: await authCallbackUrl() },
  });

  if (error) return { ok: false, error: reportAuthError("sendMagicLink", error) };
  return { ok: true, data: undefined };
}

/**
 * Ask for a password reset email.
 *
 * The answer is the same whether or not the address has an account. An endpoint
 * that says "no such account" is an account enumeration oracle, and this one is
 * unauthenticated, so it would be a free membership list. Every branch below,
 * including a Supabase failure and the feature being switched off, returns the
 * same ok result. Failures still reach the runtime log.
 */
export async function requestPasswordReset(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const neutral: ActionResult = { ok: true, data: undefined };

  if (honeypotTripped(formData)) return neutral;

  const email = z.string().trim().email().safeParse(String(formData.get("email") ?? ""));
  // Even a malformed address gets the neutral answer, so the shape of the reply
  // never becomes a signal about what is in the table.
  if (!email.success) return neutral;

  if (!PASSWORD_RESET_ENABLED) {
    logAuthError("requestPasswordReset", { code: "feature_disabled", message: "PASSWORD_RESET_ENABLED is false" });
    return neutral;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: await authCallbackUrl(PASSWORD_RESET_PATH),
  });

  // Logged, never shown. The reader gets the same sentence either way.
  logAuthError("requestPasswordReset", error);
  return neutral;
}

/**
 * Set a new password from a recovery session.
 *
 * Reachable only from /auth/reset, which refuses anyone who did not arrive
 * through a recovery link. This re-checks the session rather than trusting the
 * page, because a server action is its own entry point.
 */
export async function updatePassword(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = newPassword.safeParse({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  // getViewer rather than a second auth.getUser: it is the one cached lookup, and
  // tests/unit/request-cache.test.ts keeps it that way.
  const viewer = await getViewer();
  if (!viewer) {
    return { ok: false, error: "That reset link has expired. Ask for a new one." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: reportAuthError("updatePassword", error) };

  // The recovery marker has done its job. Clearing it means the link cannot be
  // replayed from a back button into a second password change.
  await clearRecoveryMarker();

  redirect("/settings");
}

export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = String(formData.get("provider") ?? "");
  if (provider !== "discord" && provider !== "google") return;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: await authCallbackUrl() },
  });

  if (error) {
    logAuthError(`signInWithProvider:${provider}`, error);
    redirect("/auth/sign-in?error=provider");
  }

  if (data?.url) redirect(data.url);
}

/**
 * Clears the session and drops the reader back on the landing page. Used by the
 * header menu and by settings, so there is one path out of an account.
 */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  logAuthError("signOut", error);

  redirect("/");
}
