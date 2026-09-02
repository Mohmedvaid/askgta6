type WordmarkProps = {
  className?: string;
  title?: string;
};

/**
 * Placeholder wordmark, built from the display face and one geometric accent.
 * A human replaces this file when the real logo lands. Colors come from tokens.
 */
export function Wordmark({ className, title = "AskGTA6" }: WordmarkProps) {
  return (
    <svg
      viewBox="0 0 168 28"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="21"
        fontFamily="var(--font-display)"
        fontSize="22"
        fontWeight="700"
        letterSpacing="-0.6"
        fill="currentColor"
      >
        Ask
      </text>
      <text
        x="41"
        y="21"
        fontFamily="var(--font-display)"
        fontSize="22"
        fontWeight="800"
        letterSpacing="0.5"
        fill="var(--accent)"
      >
        GTA6
      </text>
      <rect x="0" y="25" width="38" height="2.5" rx="1.25" fill="var(--accent)" />
    </svg>
  );
}
