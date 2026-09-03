"use client";

import { useState, useTransition } from "react";
import { revealContent } from "@/actions/reveal";
import { track } from "@/lib/analytics";
import { SpoilerPlaceholder } from "./SpoilerPlaceholder";

type RevealTarget = { type: "post" | "reply"; id: string };

type RevealRegionProps = {
  target: RevealTarget;
  variant: "card" | "full";
  spoilerLevel: number;
};

/**
 * The body of a gated item. Asks the server for it once and holds it for this
 * session only. Nothing is written down and the reader's progress does not move.
 * Titles never come through here, because titles are never hidden.
 */
export function RevealRegion({ target, variant, spoilerLevel }: RevealRegionProps) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (body) {
    return (
      <div
        className="prose-body reveal-transition mt-3 text-sm"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }

  return (
    <div className="mt-3">
      <SpoilerPlaceholder variant={variant} level={spoilerLevel} />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            track("reveal_clicked", { target: target.type, spoiler_level: spoilerLevel });
            const result = await revealContent(target);
            if (result.ok) {
              setBody(result.data.body);
              setError(null);
            } else {
              setError(result.error);
            }
          })
        }
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-spoiler px-3 py-1.5 text-sm font-semibold text-spoiler"
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
