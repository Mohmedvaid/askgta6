"use server";

import { z } from "zod";
import { getPostRaw } from "@/lib/queries/posts";
import { getReplyRaw } from "@/lib/queries/replies";
import { renderMarkdown } from "@/lib/markdown";
import { canReveal } from "@/lib/spoilers";
import { type ActionResult } from "@/lib/validation";

const targetSchema = z.object({
  type: z.enum(["post", "reply"]),
  id: z.string().uuid(),
});

export type RevealedContent = { title: string | null; body: string };

/**
 * Hands back one item's content for this session. Reveals are never persisted and
 * never change the viewer's progress, so the gate is exactly as strict next page load.
 */
export async function revealContent(input: unknown): Promise<ActionResult<RevealedContent>> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That item could not be revealed." };

  if (parsed.data.type === "post") {
    const post = await getPostRaw(parsed.data.id);
    if (!post || !canReveal(post)) return { ok: false, error: "That post is no longer available." };
    return { ok: true, data: { title: post.title, body: renderMarkdown(post.body) } };
  }

  const reply = await getReplyRaw(parsed.data.id);
  if (!reply || !canReveal(reply)) return { ok: false, error: "That reply is no longer available." };
  return { ok: true, data: { title: null, body: renderMarkdown(reply.body) } };
}
