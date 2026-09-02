"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, postEditSchema, postInputSchema, type ActionResult } from "@/lib/validation";

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

  const parsed = postInputSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

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
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: describe(error?.message ?? "") };

  revalidatePath("/feed");
  redirect(`/p/${data.id}`);
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("posts")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      topic: parsed.data.topic,
      spoiler_level: parsed.data.spoilerLevel,
    })
    .eq("id", parsed.data.postId)
    .eq("author_id", viewer.userId);

  if (error) return { ok: false, error: describe(error.message) };

  revalidatePath(`/p/${parsed.data.postId}`);
  redirect(`/p/${parsed.data.postId}`);
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

  revalidatePath(`/p/${postId}`);
}
