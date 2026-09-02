import { spoilerLevelInfo } from "@/lib/spoilers";

type SpoilerBadgeProps = {
  level: number;
  tone?: "quiet" | "loud";
};

export function SpoilerBadge({ level, tone = "quiet" }: SpoilerBadgeProps) {
  const info = spoilerLevelInfo(level);
  const loud = tone === "loud";

  return (
    <span
      title={info.description}
      className={
        loud
          ? "inline-flex items-center gap-1.5 rounded-sm bg-spoiler-bg px-2 py-0.5 text-xs font-semibold text-spoiler"
          : "inline-flex items-center gap-1.5 text-xs font-medium text-text-muted"
      }
    >
      <span aria-hidden className="inline-block size-1.5 rounded-full bg-spoiler" />
      {info.label}
    </span>
  );
}
