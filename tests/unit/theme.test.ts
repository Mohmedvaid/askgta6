import { describe, expect, it } from "vitest";
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

describe("open graph palette", () => {
  it("carries the four values the image needs", () => {
    expect(Object.keys(OG_PALETTE)).toEqual(["ink", "paper", "accent", "muted"]);
    for (const value of Object.values(OG_PALETTE)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
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
