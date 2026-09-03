"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldControls } from "./ShieldControls";
import { spoilerLevelInfo } from "@/lib/spoilers";

type ShieldPillProps = {
  enabled: boolean;
  progress: number;
};

/**
 * The one place the shield lives in the chrome. It reads as its own state:
 * "Spoiler shield: off", or the chapter it is holding you at.
 */
export function ShieldPill({ enabled, progress }: ShieldPillProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const label = enabled ? spoilerLevelInfo(progress).label : "off";

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        type="button"
        // The visible label is abbreviated on small screens, so the accessible
        // name is spelled out here. Without it the button announces as "off".
        aria-label={`Spoiler shield: ${label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((was) => !was)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
          enabled ? "border-spoiler bg-spoiler-bg text-spoiler" : "border-border text-text-secondary"
        }`}
      >
        <span aria-hidden className={`inline-block size-1.5 rounded-full ${enabled ? "bg-spoiler" : "bg-text-muted"}`} />
        <span className="hidden sm:inline">Spoiler shield: </span>
        {label}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Spoiler shield"
          className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-border bg-surface-1 p-4 shadow-raised"
        >
          <ShieldControls
            enabled={enabled}
            progress={progress}
            source="header"
            onSaved={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
