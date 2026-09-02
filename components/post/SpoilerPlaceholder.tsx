/** The redacted treatment. Deliberately structured, never a blur of real text. */
export function SpoilerPlaceholder({ variant }: { variant: "card" | "full" }) {
  const bars = variant === "full" ? [92, 80, 88, 64] : [70, 46];

  return (
    <div aria-hidden className="space-y-2.5">
      <div className="h-4 w-1/2 rounded-sm bg-spoiler-bg" />
      {bars.map((width, index) => (
        <div key={index} className="h-2.5 rounded-sm bg-surface-2" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}
