import { describe, expect, it } from "vitest";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme/cookie";
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
