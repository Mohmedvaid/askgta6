"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/validation";
import { adoptAnonymousShield } from "@/lib/adopt-progress";
import { MAGIC_LINK_DISABLED, logAuthError, reportAuthError } from "@/lib/auth-errors";
import { authCallbackUrl } from "@/lib/auth-callback";
import { honeypotTripped } from "@/lib/honeypot";
import { MAGIC_LINK_ENABLED } from "@/lib/auth-features";

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Passwords are at least 8 characters."),
});

export async function signIn(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
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

  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

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
