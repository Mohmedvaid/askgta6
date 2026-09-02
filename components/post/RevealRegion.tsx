"use client";

import { useState, useTransition } from "react";
import { revealContent } from "@/actions/reveal";
import { SpoilerPlaceholder } from "./SpoilerPlaceholder";

type RevealTarget = { type: "post" | "reply"; id: string };

type RevealRegionProps = {
  target: RevealTarget;
  variant: "card" | "full";
};

/**
 * Asks the server for the content once and holds it for this session only.
 * Nothing is written down and the viewer's progress does not move.
 */
export function RevealRegion({ target, variant }: RevealRegionProps) {
  const [revealed, setRevealed] = useState<{ title: string | null; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (revealed) {
    return (
      <div className="reveal-transition">
        {revealed.title ? (
          <h3 className="font-display text-lg font-semibold text-text-primary">{revealed.title}</h3>
        ) : null}
        <div
          className="prose-body mt-2 text-sm"
          dangerouslySetInnerHTML={{ __html: revealed.body }}
        />
      </div>
    );
  }

  return (
    <div>
      <SpoilerPlaceholder variant={variant} />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await revealContent(target);
            if (result.ok) {
              setRevealed(result.data);
              setError(null);
            } else {
              setError(result.error);
            }
          })
        }
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-spoiler px-3 py-1.5 text-sm font-semibold text-spoiler"
      >
        {pending ? "Revealing" : "Reveal anyway"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
