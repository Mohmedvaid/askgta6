import { absoluteUrl } from "./site";

export type FeedItem = {
  id: string;
  title: string;
  author: string;
  createdAt: string;
};

export type FeedChannel = {
  title: string;
  description: string;
  path: string;
  items: readonly FeedItem[];
};

/** The five characters that can break out of an XML text node or attribute. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toUTCString() : date.toUTCString();
}

/**
 * An RSS 2.0 channel of titles and links.
 *
 * There is deliberately no description on an item. A body is the one thing the
 * spoiler shield holds back, and a feed reader has no shield, so shipping bodies
 * here would route around the whole mechanism. Titles are visible at every level,
 * so a title and a link are safe and are all this carries.
 */
export function renderFeed(channel: FeedChannel): string {
  const self = absoluteUrl(channel.path);
  const link = absoluteUrl(channel.path.replace(/\/feed\.xml$/, "") || "/");

  const items = channel.items
    .map((item) => {
      const url = absoluteUrl(`/p/${item.id}`);
      return [
        "    <item>",
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <dc:creator>${escapeXml(item.author)}</dc:creator>`,
        `      <pubDate>${rfc822(item.createdAt)}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "  <channel>",
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    "    <language>en</language>",
    `    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .concat("\n");
}

/** The response an RSS route returns, cached the way the sitemap is. */
export function feedResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
