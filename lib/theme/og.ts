/**
 * Open Graph images render through Satori, outside the document, so they cannot read
 * the CSS custom properties in tokens.css. These four values are the only duplicate of
 * the palette in the codebase. Keep them in step with lib/theme/tokens.css by eye.
 *
 * They are the dark theme's values, because a link preview has no theme to follow:
 * ink is --surface-0, paper is --text-primary, accent is --accent, muted is --text-muted.
 */
export const OG_PALETTE = {
  ink: "#0e0b0b",
  paper: "#f7f4f4",
  accent: "#fd71c0",
  accentInk: "#190610",
  muted: "#a39d9c",
  line: "#342f2e",
} as const;
