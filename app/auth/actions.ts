"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/validation";

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Passwords are at least 8 characters."),
});

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signIn(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: "That email and password do not match an account." };

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
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error) return { ok: false, error: "That account could not be created. Try a different email." };
  if (!data.session) return { ok: true, data: undefined };

  redirect("/onboarding");
}

export async function sendMagicLink(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = z.string().trim().email().safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { ok: false, error: "Enter a valid email address." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error) return { ok: false, error: "That link could not be sent. Try again in a minute." };
  return { ok: true, data: undefined };
}

export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = String(formData.get("provider") ?? "");
  if (provider !== "discord" && provider !== "google") return;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });

  if (data?.url) redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
