import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { generateInviteCode, slugify } from "@/lib/slug";
import { isPlaceholderUsername, isValidUsername, normalizeUsername } from "@/lib/username";
import { monthAndYear, relativeTime } from "@/lib/relative-time";
import { escapeHtml, excerpt, renderMarkdown } from "@/lib/markdown";
import { TOPIC_LABELS, TOPICS, isTopic } from "@/lib/topics";

describe("cursor", () => {
  it("round trips", () => {
    const cursor = { createdAt: "2026-05-01T10:00:00.000Z", id: "8b2f0f7a-1111-4222-8333-444455556666" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("returns null for missing, empty, and malformed values", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(Buffer.from("no-separator").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("|missing-date").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("not-a-date|abc").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("2026-05-01T10:00:00.000Z|").toString("base64url"))).toBeNull();
  });
});

describe("slugify", () => {
  it.each([
    ["Vice City locals", "vice-city-locals"],
    ["  Night   Shift  ", "night-shift"],
    ["First-timers!", "first-timers"],
    ["Café crew", "cafe-crew"],
    ["***", ""],
  ])("turns %s into %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("caps length and leaves no trailing hyphen", () => {
    const slug = slugify("a ".repeat(80));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("generateInviteCode", () => {
  it("produces eight characters from the unambiguous alphabet", () => {
    const code = generateInviteCode(() => 0);
    expect(code).toBe("AAAAAAAA");
    expect(generateInviteCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });
});

describe("username", () => {
  it.each([
    ["alice", true],
    ["a_b_9", true],
    ["ab", false],
    ["a".repeat(21), false],
    ["Alice", false],
    ["has space", false],
    ["dash-no", false],
  ])("validates %s as %s", (input, expected) => {
    expect(isValidUsername(input)).toBe(expected);
  });

  it("spots the generated placeholder", () => {
    expect(isPlaceholderUsername("player_ab12cd")).toBe(true);
    expect(isPlaceholderUsername("alice")).toBe(false);
  });

  it("normalizes what a person typed", () => {
    expect(normalizeUsername("  Vice City 6! ")).toBe("vicecity6");
    expect(normalizeUsername("A".repeat(40))).toHaveLength(20);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it.each([
    ["2026-06-01T11:59:30.000Z", "just now"],
    ["2026-06-01T11:30:00.000Z", "30m ago"],
    ["2026-06-01T06:00:00.000Z", "6h ago"],
    ["2026-05-29T12:00:00.000Z", "3d ago"],
    ["2026-05-01T12:00:00.000Z", "4w ago"],
    ["2024-06-01T12:00:00.000Z", "2y ago"],
  ])("renders %s as %s", (input, expected) => {
    expect(relativeTime(input, now)).toBe(expected);
  });

  it("accepts a Date and rejects garbage", () => {
    expect(relativeTime(new Date("2026-06-01T11:00:00.000Z"), now)).toBe("1h ago");
    expect(relativeTime("nonsense", now)).toBe("");
  });

  it("formats a join month", () => {
    expect(monthAndYear("2026-02-14T00:00:00.000Z")).toBe("February 2026");
    expect(monthAndYear("nonsense")).toBe("");
  });
});

describe("markdown", () => {
  it("escapes every dangerous character", () => {
    expect(escapeHtml(`<script>"'&`)).toBe("&lt;script&gt;&quot;&#39;&amp;");
  });

  it("never emits user supplied html", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> and <b>bold</b>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img");
  });

  it("renders paragraphs, bold, italic, and inline code", () => {
    expect(renderMarkdown("Hello **world**")).toBe("<p>Hello <strong>world</strong></p>");
    expect(renderMarkdown("Hello *world*")).toBe("<p>Hello <em>world</em></p>");
    expect(renderMarkdown("Use `npm run dev`")).toBe("<p>Use <code>npm run dev</code></p>");
  });

  it("leaves markers inside inline code alone", () => {
    expect(renderMarkdown("`**not bold**`")).toBe("<p><code>**not bold**</code></p>");
  });

  it("renders fenced code blocks verbatim", () => {
    expect(renderMarkdown("```\nconst a = 1;\n```")).toBe("<pre><code>const a = 1;</code></pre>");
  });

  it("renders bullet and numbered lists", () => {
    expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(renderMarkdown("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  it("joins wrapped lines into one paragraph and splits on a blank line", () => {
    expect(renderMarkdown("one\ntwo\n\nthree")).toBe("<p>one two</p><p>three</p>");
  });

  it("links only safe schemes", () => {
    expect(renderMarkdown("[docs](https://example.com)")).toContain('href="https://example.com"');
    expect(renderMarkdown("[home](/feed)")).toContain('href="/feed"');
    expect(renderMarkdown("[mail](mailto:a@b.co)")).toContain('href="mailto:a@b.co"');
    const unsafe = renderMarkdown("[bad](javascript:alert(1))");
    expect(unsafe).not.toContain("href=");
  });

  it("adds rel and target to external links", () => {
    const html = renderMarkdown("[docs](https://example.com)");
    expect(html).toContain('rel="nofollow noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("\n\n  \n")).toBe("");
  });
});

describe("excerpt", () => {
  it("strips markers and collapses whitespace", () => {
    expect(excerpt("**Bold**   and\n\n`code`")).toBe("Bold and code");
  });

  it("keeps link text and drops the target", () => {
    expect(excerpt("see [the map](https://example.com) here")).toBe("see the map here");
  });

  it("truncates past the limit", () => {
    const long = excerpt("word ".repeat(100));
    expect(long.length).toBeLessThanOrEqual(163);
    expect(long.endsWith("...")).toBe(true);
  });

  it("leaves short bodies alone", () => {
    expect(excerpt("short body")).toBe("short body");
  });
});

describe("topics", () => {
  it("labels every topic", () => {
    for (const topic of TOPICS) {
      expect(TOPIC_LABELS[topic].length).toBeGreaterThan(0);
    }
  });

  it("guards unknown values", () => {
    expect(isTopic("map")).toBe(true);
    expect(isTopic("nonsense")).toBe(false);
    expect(isTopic(7)).toBe(false);
  });
});

describe("normalizeUsername in the compose path", () => {
  it("strips exactly what the database check constraint would reject", () => {
    expect(normalizeUsername("Vice City 6!")).toBe("vicecity6");
    expect(normalizeUsername("night-shift")).toBe("nightshift");
    expect(isValidUsername(normalizeUsername("Vice City 6!"))).toBe(true);
  });
});
