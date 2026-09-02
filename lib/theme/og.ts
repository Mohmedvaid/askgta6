/**
 * Open Graph images render through Satori, outside the document, so they cannot read
 * the CSS custom properties in tokens.css. These four values are the only duplicate of
 * the palette in the codebase. Keep them in step with lib/theme/tokens.css by eye.
 */
export const OG_PALETTE = {
  ink: "#16181d",
  paper: "#f4f2ee",
  accent: "#f0a04b",
  muted: "#9aa0ab",
} as const;
