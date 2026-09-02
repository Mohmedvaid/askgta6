"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, reportSchema, type ActionResult } from "@/lib/validation";

export async function submitReport(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to report." };

  const parsed = reportSchema.safeParse({
    targetType: String(formData.get("targetType") ?? ""),
    targetId: String(formData.get("targetId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    note: formData.get("note") ? String(formData.get("note")) : undefined,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("reports").insert({
    reporter_id: viewer.userId,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reason: parsed.data.reason,
    note: parsed.data.note ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "You already reported this." : "That report could not be filed.",
    };
  }

  return { ok: true, data: undefined };
}
