"use client";

import { useActionState, useEffect, useState } from "react";
import { SpoilerLevelControl } from "../SpoilerLevelControl";
import { SubmitButton } from "../form/SubmitButton";
import { FieldError } from "../form/FieldError";
import { dismissProgressPrompt, setProgress } from "@/actions/profile";
import { spoilerLevelInfo } from "@/lib/spoilers";
import { track } from "@/lib/analytics";

type ProgressSheetProps = {
  progress: number;
  /** True for a logged out visitor who has never answered. Opens the sheet once. */
  promptOnLoad: boolean;
};

/**
 * The bottom sheet. It opens itself once for a visitor who has not been asked,
 * and after that the trigger button reopens it. On desktop the right column
 * already carries the same control, so the trigger only shows on small screens.
 */
export function ProgressSheet({ progress, promptOnLoad }: ProgressSheetProps) {
  const [open, setOpen] = useState(promptOnLoad);
  const [level, setLevel] = useState(progress);
  const [state, formAction] = useActionState(setProgress, null);
  const [handled, setHandled] = useState(state);

  if (state !== handled) {
    setHandled(state);
    if (state?.ok) {
      track("progress_set", { level, source: "settings" });
      setOpen(false);
    }
  }

  // Walking away from the question is an answer: it records level 0, so the
  // sheet asks once and never again.
  const dismiss = () => {
    setOpen(false);
    if (promptOnLoad) void dismissProgressPrompt();
  };

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        if (promptOnLoad) void dismissProgressPrompt();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, promptOnLoad]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 z-30 rounded-full border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-text-secondary shadow-raised lg:hidden"
      >
        Level: {spoilerLevelInfo(progress).label}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        className="absolute inset-0 bg-surface-0/80"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-sheet-title"
        className="relative w-full max-w-lg rounded-t-lg border border-border bg-surface-1 p-6 shadow-raised sm:mb-8 sm:rounded-lg"
      >
        <h2 id="progress-sheet-title" className="font-display text-xl font-semibold text-text-primary">
          Where are you in the story?
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Titles stay visible either way. This decides which post and reply bodies open up for you.
        </p>

        <form action={formAction} className="mt-6 space-y-5">
          <SpoilerLevelControl
            name="progress"
            defaultValue={progress}
            onChange={setLevel}
            label="How far you have played"
          />
          <FieldError message={state && !state.ok ? state.error : null} />

          <SubmitButton label="Save" pendingLabel="Saving" />
        </form>
      </div>
    </div>
  );
}
