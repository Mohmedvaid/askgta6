type MarkProps = {
  className?: string;
  size?: number;
};

/**
 * Square mark, used as the favicon and the avatar fallback.
 *
 * Original geometry: a solid accent tile with two lines knocked out of it. The top
 * line runs the full width, the bottom one breaks off partway and fades. That is
 * the product in two shapes, a title that is always there and a body that stops,
 * and it still reads at sixteen pixels because there are only two marks in it.
 *
 * Any change here has to be mirrored into app/icon.svg, which is a standalone copy
 * with the colors written out because a favicon cannot read CSS custom properties.
 */
export function Mark({ className, size = 32 }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="AskGTA6"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <rect x="7" y="9.5" width="18" height="4" rx="2" fill="var(--accent-text)" />
      <rect x="7" y="18.5" width="8" height="4" rx="2" fill="var(--accent-text)" />
      <rect x="18" y="18.5" width="4" height="4" rx="2" fill="var(--accent-text)" opacity="0.4" />
    </svg>
  );
}
