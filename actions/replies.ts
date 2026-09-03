"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, replyInputSchema, type ActionResult } from "@/lib/validation";
import { honeypotTripped } from "@/lib/honeypot";

export async function createReply(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to reply." };

  if (honeypotTripped(formData)) return { ok: false, error: "That reply could not be saved." };

  const parsed = replyInputSchema.safeParse({
    postId: String(formData.get("postId") ?? ""),
    body: String(formData.get("body") ?? ""),
    spoilerLevel: String(formData.get("spoilerLevel") ?? "0"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("replies").insert({
    post_id: parsed.data.postId,
    author_id: viewer.userId,
    body: parsed.data.body,
    spoiler_level: parsed.data.spoilerLevel,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("rate limit")
        ? "You are replying too quickly. Wait a minute and try again."
        : "That reply could not be saved.",
    };
  }

  revalidatePath(`/p/${parsed.data.postId}`);
  return { ok: true, data: undefined };
}

export async function deleteReply(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const replyId = String(formData.get("replyId") ?? "");
  const postId = String(formData.get("postId") ?? "");

  const supabase = await createSupabaseServerClient();
  await supabase.from("replies").delete().eq("id", replyId).eq("author_id", viewer.userId);

  revalidatePath(`/p/${postId}`);
}
