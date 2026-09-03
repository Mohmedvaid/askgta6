"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError } from "../form/FieldError";
import { setSpoilerShield } from "@/actions/profile";
import { SPOILER_LEVELS, spoilerLevelInfo } from "@/lib/spoilers";
import { track } from "@/lib/analytics";

type ShieldControlsProps = {
  enabled: boolean;
  progress: number;
  source: "header" | "settings";
  onSaved?: () => void;
};

/**
 * The toggle and the chapter list, shared by the header pill's popover and the
 * settings page so the two can never disagree. Every change saves on the spot and
 * refreshes the tree, so the feed re-gates without a full page load.
 */
export function ShieldControls({ enabled, progress, source, onSaved }: ShieldControlsProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(setSpoilerShield, null);
  const [handled, setHandled] = useState(state);

  if (state !== handled) {
    setHandled(state);
    if (state?.ok) {
      router.refresh();
      onSaved?.();
    }
  }

  // One form, submitted programmatically, so a toggle and a chapter are the same write.
  const submit = (nextEnabled: boolean, nextProgress: number) => {
    const data = new FormData();
    data.set("enabled", String(nextEnabled));
    data.set("progress", String(nextProgress));
    track("progress_set", { level: nextProgress, shield: nextEnabled, source });
    formAction(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-text-primary">Spoiler shield</p>
          <p className="mt-1 text-xs text-text-muted">
            {enabled
              ? "Post and reply bodies past your chapter are held back."
              : "Off. You see every post and reply in full."}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Spoiler shield"
          onClick={() => submit(!enabled, progress)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
            enabled ? "border-accent bg-accent" : "border-border bg-surface-2"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block size-4 rounded-full bg-surface-1 transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {enabled ? (
        <fieldset className="border-t border-border pt-4">
          <legend className="sr-only">How far you have played</legend>
          <p className="mb-2 text-xs font-semibold tracking-widest text-text-muted uppercase">
            How far you have played
          </p>

          <ul className="space-y-0.5">
            {SPOILER_LEVELS.map((level) => {
              const current = level.level === progress;
              return (
                <li key={level.level}>
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    onClick={() => submit(true, level.level)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                      current ? "bg-accent-bg font-semibold text-accent" : "text-text-secondary hover:bg-surface-2"
                    }`}
                  >
                    {level.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs text-text-muted">{spoilerLevelInfo(progress).description}</p>
        </fieldset>
      ) : null}

      <FieldError message={state && !state.ok ? state.error : null} />
    </div>
  );
}
