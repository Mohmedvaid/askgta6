"use client";

import { useId, useState } from "react";
import { SPOILER_LEVELS, clampProgress, spoilerLevelInfo } from "@/lib/spoilers";

type SpoilerLevelControlProps = {
  name: string;
  defaultValue: number;
  label: string;
  hint?: string;
  onChange?: (level: number) => void;
};

/** One slider, eight stops, the description of the current stop always visible. */
export function SpoilerLevelControl({ name, defaultValue, label, hint, onChange }: SpoilerLevelControlProps) {
  const id = useId();
  const [level, setLevel] = useState(clampProgress(defaultValue));
  const info = spoilerLevelInfo(level);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-semibold text-text-primary">
          {label}
        </label>
        <span className="text-sm font-semibold text-accent">{info.label}</span>
      </div>

      <input
        id={id}
        name={name}
        type="range"
        min={0}
        max={SPOILER_LEVELS.length - 1}
        step={1}
        value={level}
        aria-describedby={`${id}-description`}
        onChange={(event) => {
          const next = clampProgress(event.target.value);
          setLevel(next);
          onChange?.(next);
        }}
        className="mt-3 w-full accent-accent"
      />

      <p id={`${id}-description`} className="mt-2 text-sm text-text-secondary">
        {info.description}
      </p>
      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}
