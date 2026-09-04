type WordmarkProps = {
  className?: string;
  title?: string;
};

/**
 * The wordmark. The name is set in the display face, so it follows a theme swap
 * rather than being frozen into a path, and the two tspans flow rather than sitting
 * at hand placed offsets, so a wider or narrower face cannot break the spacing.
 *
 * Under it, the same original motif the square mark carries: a rule that runs, then
 * breaks, then fades. Nothing here imitates anyone else's logo or lettering.
 */
export function Wordmark({ className, title = "AskGTA6" }: WordmarkProps) {
  return (
    <svg
      viewBox="0 0 106 30"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text x="0" y="20" fontFamily="var(--font-display)" fontSize="21" letterSpacing="-0.4">
        <tspan fill="currentColor">Ask</tspan>
        <tspan fill="var(--accent)">GTA6</tspan>
      </text>
      <rect x="0" y="25" width="34" height="3" rx="1.5" fill="var(--accent)" />
      <rect x="39" y="25" width="12" height="3" rx="1.5" fill="var(--accent)" opacity="0.45" />
    </svg>
  );
}
