import { describe, expect, it } from "vitest";
import { contrast, over, readTheme, type Tokens } from "./color";

/**
 * WCAG AA against the real tokens file, for every pair a component actually puts
 * on screen. Text and the sealed body treatment need 4.5:1; the focus ring needs
 * 3:1 against what sits behind it.
 *
 * Card dividers and the aria-hidden skeleton bars are deliberately not here. They
 * are decoration, not UI component boundaries, and holding them to 3:1 would mean
 * a louder border than the design wants for no accessibility gain.
 */
const THEMES: Array<["dark" | "light", Tokens]> = [
  ["dark", readTheme("dark")],
  ["light", readTheme("light")],
];

const TEXT = [
  ["text-primary", "surface-0"],
  ["text-primary", "surface-1"],
  ["text-secondary", "surface-0"],
  ["text-secondary", "surface-1"],
  ["text-muted", "surface-0"],
  ["text-muted", "surface-1"],
  ["text-muted", "surface-2"],
] as const;

const ACCENT = [
  // A link, and the label on a filled button.
  ["accent", "surface-0"],
  ["accent", "surface-1"],
  ["accent-text", "accent"],
  // The vote control, the active topic chip, and the chapter list selection.
  ["accent", "accent-bg"],
] as const;

const SEMANTIC = [
  ["danger", "surface-0"],
  ["danger", "surface-1"],
  ["success", "surface-1"],
  ["warning", "surface-1"],
] as const;

const SEAL = [
  // The loud spoiler badge and the shield pill when it is on.
  ["spoiler", "spoiler-bg"],
  ["spoiler", "surface-0"],
  ["spoiler", "surface-1"],
] as const;

describe.each(THEMES)("%s theme meets AA", (_theme, tokens) => {
  const pair = (fg: string, bg: string) => contrast(tokens[`--${fg}`]!, tokens[`--${bg}`]!);

  it.each(TEXT)("%s on %s", (fg, bg) => {
    expect(pair(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ACCENT)("%s on %s", (fg, bg) => {
    expect(pair(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SEMANTIC)("%s on %s", (fg, bg) => {
    expect(pair(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SEAL)("%s on %s", (fg, bg) => {
    expect(pair(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the sealed body legible on the panel it is actually drawn on", () => {
    // SpoilerPlaceholder is bg-spoiler-bg/40 over the card, with text-spoiler on it.
    for (const surface of ["--surface-0", "--surface-1"] as const) {
      const panel = over(tokens["--spoiler-bg"]!, tokens[surface]!, 0.4);
      expect(contrast(tokens["--spoiler"]!, panel)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the focus ring visible against both surfaces", () => {
    expect(pair("accent", "surface-0")).toBeGreaterThanOrEqual(3);
    expect(pair("accent", "surface-1")).toBeGreaterThanOrEqual(3);
  });
});
