"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, replyInputSchema, type ActionResult } from "@/lib/validation";
import { honeypotTripped } from "@/lib/honeypot";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";
import { containsLink } from "@/lib/links";
import { checkLinkPrivilege } from "@/lib/link-privilege";
import { checkSpam, quarantine } from "@/lib/spam";

export async function createReply(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to reply." };

  if (honeypotTripped(formData)) return { ok: false, error: "That reply could not be saved." };

  const human = await verifyTurnstile(String(formData.get(TURNSTILE_FIELD) ?? "") || null);
  if (!human.ok) return { ok: false, error: "That did not look like a person. Reload the page and try again." };

  const parsed = replyInputSchema.safeParse({
    postId: String(formData.get("postId") ?? ""),
    body: String(formData.get("body") ?? ""),
    spoilerLevel: String(formData.get("spoilerLevel") ?? "0"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  if (containsLink(parsed.data.body)) {
    const privilege = await checkLinkPrivilege(viewer);
    if (!privilege.allowed) return { ok: false, error: privilege.reason };
  }

  const verdict = await checkSpam({ body: parsed.data.body });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("replies")
    .insert({
      post_id: parsed.data.postId,
      author_id: viewer.userId,
      body: parsed.data.body,
      spoiler_level: parsed.data.spoilerLevel,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message.includes("rate limit")
        ? "You are replying too quickly. Wait a minute and try again."
        : "That reply could not be saved.",
    };
  }

  if (verdict.spam && data) await quarantine("reply", data.id, viewer.userId, verdict.note);

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
