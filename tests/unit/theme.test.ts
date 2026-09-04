import { describe, expect, it } from "vitest";
import { linearToHex, readTheme } from "./color";
import { THEME_BOOTSTRAP, THEME_COOKIE, resolveTheme } from "@/lib/theme/cookie";
import { OG_PALETTE } from "@/lib/theme/og";

describe("theme cookie", () => {
  it("names the cookie once", () => {
    expect(THEME_COOKIE).toBe("askgta6-theme");
  });

  it("defaults to dark for anything that is not light", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme(undefined)).toBe("dark");
    expect(resolveTheme("sepia")).toBe("dark");
  });
});

/** The dark theme block of tokens.css, which is what an Open Graph card wears. */
function darkHex(): Record<string, string> {
  const tokens = readTheme("dark");
  return Object.fromEntries(Object.entries(tokens).map(([name, rgb]) => [name, linearToHex(rgb)]));
}

describe("open graph palette", () => {
  it("carries the six values the image needs, as hex", () => {
    expect(Object.keys(OG_PALETTE)).toEqual(["ink", "paper", "accent", "accentInk", "muted", "line"]);
    for (const value of Object.values(OG_PALETTE)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("still matches the dark theme it is a copy of", () => {
    // Satori cannot read CSS custom properties, so these six are duplicated by
    // hand. This is the check that they were not left behind by a palette change.
    const dark = darkHex();

    expect(OG_PALETTE.ink).toBe(dark["--surface-0"]);
    expect(OG_PALETTE.paper).toBe(dark["--text-primary"]);
    expect(OG_PALETTE.accent).toBe(dark["--accent"]);
    expect(OG_PALETTE.accentInk).toBe(dark["--accent-text"]);
    expect(OG_PALETTE.muted).toBe(dark["--text-muted"]);
    expect(OG_PALETTE.line).toBe(dark["--border"]);
  });
});

describe("THEME_BOOTSTRAP", () => {
  function run(cookie: string) {
    document.cookie = `${THEME_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    if (cookie) document.cookie = `${THEME_COOKIE}=${cookie}`;
    delete document.documentElement.dataset.theme;
    new Function(THEME_BOOTSTRAP)();
    return document.documentElement.dataset.theme;
  }

  it("switches a light reader over before the page paints", () => {
    expect(run("light")).toBe("light");
  });

  it("falls back to dark for anything else, which is what the server sent", () => {
    expect(run("dark")).toBe("dark");
    expect(run("sepia")).toBe("dark");
    expect(run("")).toBe("dark");
  });

  it("survives a jar it cannot read rather than throwing during boot", () => {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    expect(() => new Function(THEME_BOOTSTRAP)()).not.toThrow();

    if (original) Object.defineProperty(Document.prototype, "cookie", original);
    // @ts-expect-error removing the shadowing own property restores the prototype getter
    delete document.cookie;
  });
});
