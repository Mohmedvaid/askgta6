"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, profileSchema, progressSchema, type ActionResult } from "@/lib/validation";

/** One screen, both fields, one round trip. */
export async function completeOnboarding(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in first." };

  const name = profileSchema.safeParse({ username: String(formData.get("username") ?? "") });
  if (!name.success) return { ok: false, error: firstIssue(name.error) };

  const level = progressSchema.safeParse({ progress: String(formData.get("progress") ?? "0") });
  if (!level.success) return { ok: false, error: firstIssue(level.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ username: name.data.username, progress: level.data.progress })
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
