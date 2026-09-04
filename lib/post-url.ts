import type { PostKind } from "./topics";

/**
 * Where a post lives. Questions and discussions read differently enough in a
 * search result to be worth different prefixes, and the prefix is derived from
 * the row rather than stored, so it cannot drift from the kind.
 *
 * The short id is the part that resolves the post. The slug is derived from the
 * title, so an old link can carry a stale one; the route redirects instead of
 * failing, which is the whole reason the id comes first in the path.
 */
export const POST_PREFIXES = { question: "ask", discussion: "talk" } as const;

export type PostPrefix = (typeof POST_PREFIXES)[PostKind];

export type PostUrlParts = { kind: PostKind; short_id: string; slug: string };

export function isPostPrefix(value: string): value is PostPrefix {
  return value === "ask" || value === "talk";
}

export function kindForPrefix(prefix: PostPrefix): PostKind {
  return prefix === "ask" ? "question" : "discussion";
}

export function prefixForKind(kind: PostKind): PostPrefix {
  return POST_PREFIXES[kind];
}

/** The canonical path for a post. Everything that links to one goes through here. */
export function postPath(post: PostUrlParts): string {
  return `/${prefixForKind(post.kind)}/${post.short_id}/${post.slug}`;
}

/** The legacy path, which the /p route redirects. Kept for links that only hold a uuid. */
export function legacyPostPath(postId: string): string {
  return `/p/${postId}`;
}

const POST_PATH = /^\/(ask|talk)\/[0-9a-z]{8}\/[a-z0-9-]{1,60}$/;

/**
 * A post path a form or a client component sent back, or null.
 *
 * Server actions revalidate the page the reader is standing on, and the id in
 * the URL is not the id the action works with, so the path travels with the
 * request. This is what stops it being an arbitrary string: only a path this
 * app could have produced is worth handing to revalidatePath.
 */
export function safePostPath(value: unknown): string | null {
  return typeof value === "string" && POST_PATH.test(value) ? value : null;
}
