type MarkProps = {
  className?: string;
  size?: number;
};

/** Square mark for the favicon and the avatar fallback. */
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
      <rect width="32" height="32" rx="8" fill="var(--accent-bg)" />
      <circle cx="16" cy="13" r="6" fill="var(--accent)" />
      <rect x="4" y="20" width="24" height="2.5" rx="1.25" fill="var(--accent)" opacity="0.85" />
      <rect x="8" y="25" width="16" height="2.5" rx="1.25" fill="var(--accent)" opacity="0.5" />
    </svg>
  );
}
