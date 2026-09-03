"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/validation";
import { adoptAnonymousShield } from "@/lib/adopt-progress";
import { logAuthError, reportAuthError } from "@/lib/auth-errors";
import { authCallbackUrl } from "@/lib/auth-callback";

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
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: authCallbackUrl() },
  });

  if (error) return { ok: false, error: reportAuthError("signUp", error) };
  if (!data.session || !data.user) return { ok: true, data: undefined };

  // Whatever level they picked as a guest follows them into the account.
  await adoptAnonymousShield(supabase, data.user.id);

  redirect("/onboarding");
}

export async function sendMagicLink(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = z.string().trim().email().safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { ok: false, error: "Enter a valid email address." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: authCallbackUrl() },
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
    options: { redirectTo: authCallbackUrl() },
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
