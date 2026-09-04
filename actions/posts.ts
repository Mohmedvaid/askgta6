"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, postEditSchema, postInputSchema, type ActionResult } from "@/lib/validation";
import { honeypotTripped } from "@/lib/honeypot";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";
import { containsLink } from "@/lib/links";
import { checkLinkPrivilege } from "@/lib/link-privilege";
import { checkSpam, quarantine } from "@/lib/spam";
import { legacyPostPath, postPath, safePostPath, type PostUrlParts } from "@/lib/post-url";

function readForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    topic: String(formData.get("topic") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    spoilerLevel: String(formData.get("spoilerLevel") ?? "0"),
    groupId: formData.get("groupId") ? String(formData.get("groupId")) : null,
  };
}

function describe(message: string): string {
  if (message.includes("rate limit")) return "You are posting too quickly. Wait a minute and try again.";
  if (message.includes("row-level security")) return "You cannot post in that group.";
  return "That post could not be saved. Check the fields and try again.";
}

export async function createPost(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to post." };

  // Nothing is written and nothing is explained. A person never sees this.
  if (honeypotTripped(formData)) return { ok: false, error: "That post could not be saved." };

  const human = await verifyTurnstile(String(formData.get(TURNSTILE_FIELD) ?? "") || null);
  if (!human.ok) return { ok: false, error: "That did not look like a person. Reload the page and try again." };

  const parsed = postInputSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  if (containsLink(parsed.data.body) || containsLink(parsed.data.title)) {
    const privilege = await checkLinkPrivilege(viewer);
    if (!privilege.allowed) return { ok: false, error: privilege.reason };
  }

  // Checked before the write so the note is ready, applied after so the row exists
  // to hide and to report against.
  const verdict = await checkSpam({ body: parsed.data.body });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: viewer.userId,
      group_id: parsed.data.groupId ?? null,
      topic: parsed.data.topic,
      kind: parsed.data.kind,
      title: parsed.data.title,
      body: parsed.data.body,
      spoiler_level: parsed.data.spoilerLevel,
    })
    // The short id and slug are written by a trigger, so they come back from the
    // insert rather than being guessed here.
    .select("id, short_id, slug, kind")
    .single();

  if (error || !data) return { ok: false, error: describe(error?.message ?? "") };

  if (verdict.spam) await quarantine("post", data.id, viewer.userId, verdict.note);

  revalidatePath("/feed");
  redirect(postPath(data as PostUrlParts));
}

export async function editPost(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to edit." };

  const parsed = postEditSchema.safeParse({
    ...readForm(formData),
    kind: "question",
    postId: String(formData.get("postId") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  if (containsLink(parsed.data.body) || containsLink(parsed.data.title)) {
    const privilege = await checkLinkPrivilege(viewer);
    if (!privilege.allowed) return { ok: false, error: privilege.reason };
  }

  // An edit is a second chance to smuggle the same payload in, so the filter runs
  // here too. The post excludes itself from the duplicate check.
  const verdict = await checkSpam({ body: parsed.data.body, excludeId: parsed.data.postId });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      topic: parsed.data.topic,
      spoiler_level: parsed.data.spoilerLevel,
    })
    .eq("id", parsed.data.postId)
    .eq("author_id", viewer.userId)
    // An edited title means a new slug, so the path to go back to is read from
    // the row the update returned, not built from what came in.
    .select("short_id, slug, kind")
    .maybeSingle();

  if (error) return { ok: false, error: describe(error.message) };

  if (verdict.spam) await quarantine("post", parsed.data.postId, viewer.userId, verdict.note);

  const path = data ? postPath(data as PostUrlParts) : legacyPostPath(parsed.data.postId);
  revalidatePath(path);
  redirect(path);
}

export async function deletePost(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const postId = String(formData.get("postId") ?? "");
  const supabase = await createSupabaseServerClient();
  await supabase.from("posts").delete().eq("id", postId).eq("author_id", viewer.userId);

  revalidatePath("/feed");
  redirect("/feed");
}

export async function acceptReply(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const postId = String(formData.get("postId") ?? "");
  const replyId = formData.get("replyId") ? String(formData.get("replyId")) : null;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("accept_reply", { p_post_id: postId, p_reply_id: replyId });

  revalidatePath(safePostPath(formData.get("path")) ?? legacyPostPath(postId));
}
