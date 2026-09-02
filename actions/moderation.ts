"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient, isAdmin } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";
import { firstIssue, moderationSchema, type ActionResult } from "@/lib/validation";

/** Admin only. The membership check runs here, on the server, on every call. */
export async function moderate(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!isAdmin(viewer?.userId)) return { ok: false, error: "That action is not available to you." };

  const parsed = moderationSchema.safeParse({
    targetType: String(formData.get("targetType") ?? ""),
    targetId: String(formData.get("targetId") ?? ""),
    action: String(formData.get("action") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const admin = createSupabaseAdminClient();
  const table = parsed.data.targetType === "post" ? "posts" : "replies";

  if (parsed.data.action === "delete") {
    const { error } = await admin.from(table).delete().eq("id", parsed.data.targetId);
    if (error) return { ok: false, error: "That item could not be deleted." };
  } else {
    const { error } = await admin.rpc("set_hidden", {
      p_target_type: parsed.data.targetType,
      p_target_id: parsed.data.targetId,
      p_hidden: parsed.data.action === "hide",
    });
    if (error) return { ok: false, error: "That item could not be updated." };
  }

  revalidatePath("/admin/reports");
  return { ok: true, data: undefined };
}
