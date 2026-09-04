import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { escapeXml, feedResponse, renderFeed } from "@/lib/rss";

const ITEMS = [
  {
    short_id: "k3m91xqz",
    slug: "how-big-is-leonida",
    kind: "question" as const,
    title: "How big is Leonida",
    author: "Vic",
    createdAt: "2026-02-01T10:00:00.000Z",
  },
  {
    short_id: "p7w2adc4",
    slug: "radio-stations-the-best-one",
    kind: "discussion" as const,
    title: "Radio stations & the <best> one",
    author: "mona",
    createdAt: "2026-01-30T08:30:00.000Z",
  },
];

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://askgta6.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("escapeXml", () => {
  it("escapes every character that can break out of a node", () => {
    expect(escapeXml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });
});

describe("renderFeed", () => {
  const feed = () =>
    renderFeed({ title: "AskGTA6", description: "Trailer level threads.", path: "/feed.xml", items: ITEMS });

  it("renders an RSS 2.0 channel with a self link", () => {
    const xml = feed();

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>AskGTA6</title>");
    expect(xml).toContain("<link>https://askgta6.test/</link>");
    expect(xml).toContain('<atom:link href="https://askgta6.test/feed.xml" rel="self"');
  });

  it("carries a title, a link, an author, and a date for each item", () => {
    const xml = feed();

    expect(xml).toContain("<title>How big is Leonida</title>");
    expect(xml).toContain("<link>https://askgta6.test/ask/k3m91xqz/how-big-is-leonida</link>");
    expect(xml).toContain('<guid isPermaLink="true">https://askgta6.test/ask/k3m91xqz/how-big-is-leonida</guid>');
    expect(xml).toContain("<dc:creator>Vic</dc:creator>");
    expect(xml).toContain("<pubDate>Sun, 01 Feb 2026 10:00:00 GMT</pubDate>");
    expect(xml.match(/<item>/g)).toHaveLength(2);
  });

  it("never carries a body, in any element", () => {
    const xml = feed();
    const items = xml.slice(xml.indexOf("<item>"));

    // The channel has one description. No item does, and nothing carries a body.
    expect(items).not.toContain("<description>");
    expect(items).not.toContain("content:encoded");
    expect(xml.match(/<description>/g)).toHaveLength(1);
  });

  it("escapes a title that would break the document", () => {
    const xml = feed();
    expect(xml).toContain("Radio stations &amp; the &lt;best&gt; one");
    expect(xml).not.toContain("<best>");
  });

  it("renders a valid empty channel when there is nothing to syndicate", () => {
    const xml = renderFeed({ title: "AskGTA6", description: "Nothing yet.", path: "/feed.xml", items: [] });

    expect(xml).toContain("<channel>");
    expect(xml).toContain("</rss>");
    expect(xml).not.toContain("<item>");
  });

  it("points a group feed back at the group page", () => {
    const xml = renderFeed({ title: "Map nerds", description: "d", path: "/g/map-nerds/feed.xml", items: [] });

    expect(xml).toContain("<link>https://askgta6.test/g/map-nerds</link>");
    expect(xml).toContain('href="https://askgta6.test/g/map-nerds/feed.xml"');
  });

  it("falls back to the epoch rather than emitting an invalid date", () => {
    const xml = renderFeed({
      title: "t",
      description: "d",
      path: "/feed.xml",
      items: [
        { short_id: "aaaaaaaa", slug: "t", kind: "question" as const, title: "t", author: "a", createdAt: "not a date" },
      ],
    });

    expect(xml).toContain("<pubDate>Thu, 01 Jan 1970 00:00:00 GMT</pubDate>");
  });
});

describe("feedResponse", () => {
  it("serves RSS with a shared cache window", async () => {
    const response = feedResponse("<rss />");

    expect(response.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(await response.text()).toBe("<rss />");
  });
});
