"use client";

import { useState } from "react";
import { SPOILER_LEVELS, applySpoilerGateAll, spoilerLevelInfo } from "@/lib/spoilers";
import { SpoilerPlaceholder } from "./post/SpoilerPlaceholder";
import { SpoilerBadge } from "./SpoilerBadge";

const SAMPLES = [
  {
    id: "sample-0",
    spoiler_level: 0,
    title: "How big is Leonida compared to San Andreas",
    body: "Trailer two shows swamp, coastline, and city in one pass. Everyone has a guess. Post yours.",
  },
  {
    id: "sample-2",
    spoiler_level: 2,
    title: "Best approach to the second act job",
    body: "Placeholder for a mid game question that a new player should not read on the front page.",
  },
  {
    id: "sample-6",
    spoiler_level: 6,
    title: "The set piece near the end of the story",
    body: "Placeholder for a late game thread that stays sealed until you say you have got there.",
  },
];

/** The landing page demo. Entirely client side, no data, no account needed. */
export function SpoilerDemo() {
  const [progress, setProgress] = useState(0);
  const gated = applySpoilerGateAll(SAMPLES, progress);
  const info = spoilerLevelInfo(progress);

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <label htmlFor="demo-progress" className="text-sm font-semibold text-text-primary">
          Drag to set how far you have played
        </label>
        <span className="text-sm font-semibold text-accent">{info.label}</span>
      </div>

      <input
        id="demo-progress"
        type="range"
        min={0}
        max={SPOILER_LEVELS.length - 1}
        step={1}
        value={progress}
        onChange={(event) => setProgress(Number(event.target.value))}
        className="mt-4 w-full accent-accent"
      />
      <p className="mt-2 text-sm text-text-secondary">{info.description}</p>

      <ul className="mt-8 space-y-4">
        {gated.map((sample) => (
          <li key={sample.id} className="rounded-md border border-border bg-surface-0 p-5">
            <SpoilerBadge level={sample.spoiler_level} tone={sample.hidden ? "loud" : "quiet"} />
            <div className="mt-3">
              {sample.hidden ? (
                <SpoilerPlaceholder variant="card" />
              ) : (
                <div className="reveal-transition">
                  <h3 className="font-display text-lg font-semibold text-text-primary">{sample.title}</h3>
                  <p className="mt-1.5 text-sm text-text-secondary">{sample.body}</p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
