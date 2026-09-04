import { describe, expect, it } from "vitest";
import { USER_LINK_REL, containsLink, extractLinks, hostOf, linkedHosts } from "@/lib/links";
import { renderMarkdown } from "@/lib/markdown";

describe("the rel every user authored link carries", () => {
  it("is nofollow, ugc, and noopener, in that order", () => {
    expect(USER_LINK_REL).toBe("nofollow ugc noopener");
  });

  it("is on every rendered markdown link, alongside target blank", () => {
    const html = renderMarkdown("See [the map](https://example.com/map) for this.");

    expect(html).toContain('rel="nofollow ugc noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="https://example.com/map"');
  });

  it("still refuses a javascript href rather than linking it", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");

    // The text survives as escaped prose, which is inert. What must not exist is
    // an anchor pointing at it.
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
  });

  it("emits no embed, no image, and no iframe, whatever the link points at", () => {
    const html = renderMarkdown("[clip](https://youtube.com/watch?v=abc) and https://i.imgur.com/x.png");

    // Links stay links. Nothing here unfurls a URL into media.
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<video");
  });
});

describe("extractLinks", () => {
  it("finds a bare https URL", () => {
    expect(extractLinks("look at https://example.com/thing now")).toEqual(["https://example.com/thing"]);
  });

  it("finds a www link with no scheme, because it reads as a link to a person", () => {
    expect(containsLink("go to www.example.com")).toBe(true);
  });

  it("finds a markdown link target", () => {
    expect(extractLinks("[here](https://example.com)")).toContain("https://example.com");
  });

  it("finds nothing in ordinary prose", () => {
    expect(containsLink("The causeway is about forty seconds at speed.")).toBe(false);
    expect(containsLink("Chapter 3. no links here at all")).toBe(false);
  });

  it("does not swallow the closing paren of a markdown link", () => {
    expect(extractLinks("[here](https://example.com/a)")).toContain("https://example.com/a");
  });
});

describe("hostOf", () => {
  it("lowercases and drops a leading www", () => {
    expect(hostOf("https://WWW.Example.COM/path")).toBe("example.com");
  });

  it("copes with no scheme", () => {
    expect(hostOf("bit.ly/abc")).toBe("bit.ly");
  });

  it("is null for something that is not a URL", () => {
    expect(hostOf("not a url at all")).toBeNull();
  });

  it("deduplicates the hosts a body points at", () => {
    expect(linkedHosts("https://example.com/a and https://example.com/b and https://other.test").sort()).toEqual([
      "example.com",
      "other.test",
    ]);
  });
});
