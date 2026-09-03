import type { Metadata } from "next";

/**
 * Search engine indexing is off everywhere by default. Turning it on takes a
 * deliberate NEXT_PUBLIC_INDEXING=on, and even then only a small set of public
 * pages become indexable. Everything else stays noindex permanently.
 *
 * NEXT_PUBLIC_INDEXING is inlined at build time, so changing it needs a rebuild.
 */
export function indexingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_INDEXING === "on";
}

export const NOINDEX: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false, noimageindex: true },
};

export const INDEX: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true },
};

/**
 * The robots directive for a page. `indexable` says whether the page would be
 * indexable at all; the flag decides whether that permission is granted today.
 */
export function robotsFor(indexable: boolean): Metadata["robots"] {
  return indexable && indexingEnabled() ? INDEX : NOINDEX;
}

/**
 * Routes that stay noindex whatever the flag says. Written as Next.js path
 * patterns so `next.config.ts` can send an X-Robots-Tag header for them too.
 */
export const NEVER_INDEXED_SOURCES = [
  "/auth/:path*",
  "/settings",
  "/settings/:path*",
  "/admin/:path*",
  "/new",
  "/g/new",
  "/g/:slug/new",
  "/g/join/:code",
  "/onboarding",
] as const;

const NEVER_INDEXED_MATCHERS = [
  /^\/auth(\/|$)/,
  /^\/settings(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/new$/,
  /^\/g\/new$/,
  /^\/g\/[^/]+\/new$/,
  /^\/g\/join(\/|$)/,
  /^\/onboarding$/,
];

/** True for a path that is noindex regardless of the flag. */
export function isPermanentlyNoindex(pathname: string): boolean {
  return NEVER_INDEXED_MATCHERS.some((matcher) => matcher.test(pathname));
}

/**
 * Titles are visible at every level, so every public post is worth indexing
 * whatever it is tagged. What still bars a post is moderation and group privacy:
 * a post inside a private group must never reach a crawler.
 */
export function postIsIndexable(
  post: { is_hidden?: boolean; group?: { visibility: "public" | "private" } | null } | null,
): boolean {
  if (!post) return false;
  if (post.is_hidden === true) return false;
  return !post.group || post.group.visibility === "public";
}

/** Only public groups are indexable. A private group is not even acknowledged. */
export function groupIsIndexable(group: { visibility: "public" | "private" } | null): boolean {
  return group?.visibility === "public";
}

/**
 * Every real profile is indexable now that titles are visible: a profile page
 * always carries readable post titles even when every body on it is sealed.
 */
export function profileIsIndexable(exists: boolean): boolean {
  return exists;
}

/** The feed is indexable, but a search result page for an arbitrary query is not. */
export function feedIsIndexable(searchQuery: string | null | undefined): boolean {
  return !searchQuery;
}
