"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, profileSchema, type ActionResult } from "@/lib/validation";

/**
 * One field, one round trip. Onboarding no longer asks how far you have played:
 * with the shield off by default that answer does nothing until you turn it on,
 * and the header pill is where you turn it on.
 */
export async function completeOnboarding(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in first." };

  const name = profileSchema.safeParse({ username: String(formData.get("username") ?? "") });
  if (!name.success) return { ok: false, error: firstIssue(name.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ username: name.data.username })
    .eq("id", viewer.userId);

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "That username is taken." : "That could not be saved.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
