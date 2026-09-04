/**
 * Link handling for user authored text.
 *
 * Two rules, both about the same thing. Every outbound link carries
 * rel="nofollow ugc noopener" and target="_blank", so a forum with an open compose
 * box is worth nothing to a link seller and cannot hand a target page control of
 * the tab it opened from. And links stay links: nothing here unfurls, embeds, or
 * fetches a URL, so a posted address cannot become media on the page.
 */

/** The rel every user authored link gets, in this order, everywhere. */
export const USER_LINK_REL = "nofollow ugc noopener";

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const MARKDOWN_LINK = /\[[^\]]*\]\(\s*([^)\s]+)/g;

/** Hostname of a URL, lowercased and without a leading www, or null if unparseable. */
export function hostOf(value: string): string | null {
  const candidate = value.trim();
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Every link in a body, from bare URLs and from markdown link targets.
 *
 * Deliberately generous about what counts. A gate that only catches
 * `https://` misses `www.`, and something that reads as a link to a person is a
 * link for the purposes of both rules here.
 */
export function extractLinks(body: string): string[] {
  const found = new Set<string>();

  for (const match of body.matchAll(MARKDOWN_LINK)) {
    const href = match[1]!.trim();
    if (/^(https?:\/\/|www\.)/i.test(href)) found.add(href);
  }

  for (const match of body.matchAll(URL_PATTERN)) found.add(match[0]);

  return [...found];
}

export function containsLink(body: string): boolean {
  return extractLinks(body).length > 0;
}

/** The hosts a body points at, deduplicated. */
export function linkedHosts(body: string): string[] {
  const hosts = new Set<string>();
  for (const link of extractLinks(body)) {
    const host = hostOf(link);
    if (host) hosts.add(host);
  }
  return [...hosts];
}
