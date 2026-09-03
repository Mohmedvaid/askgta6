import { spoilerLevelInfo } from "@/lib/spoilers";

/**
 * The sealed body treatment. The title sits above this and is always visible, so
 * this only has to say what is missing and why. Structured bars, never a blur of
 * real text: the server did not send the words in the first place.
 */
export function SpoilerPlaceholder({ variant, level }: { variant: "card" | "full"; level: number }) {
  const bars = variant === "full" ? [92, 80, 88, 64] : [70, 46];

  return (
    <div className="rounded-md border border-spoiler-bg bg-spoiler-bg/40 p-4">
      <p className="text-xs font-semibold text-spoiler">
        Body hidden until {spoilerLevelInfo(level).label}
      </p>
      <div aria-hidden className="mt-3 space-y-2.5">
        {bars.map((width, index) => (
          <div key={index} className="h-2.5 rounded-sm bg-surface-2" style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}
