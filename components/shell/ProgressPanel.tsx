"use client";

import { useActionState, useState } from "react";
import { SpoilerLevelControl } from "../SpoilerLevelControl";
import { SubmitButton } from "../form/SubmitButton";
import { FieldError } from "../form/FieldError";
import { setProgress } from "@/actions/profile";
import { track } from "@/lib/analytics";

/** The context column control. Changing it re-gates every page immediately. */
export function ProgressPanel({ progress }: { progress: number }) {
  const [state, formAction] = useActionState(setProgress, null);
  const [level, setLevel] = useState(progress);
  const [handled, setHandled] = useState(state);

  if (state !== handled) {
    setHandled(state);
    if (state?.ok) track("progress_set", { level, source: "settings" });
  }

  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Your progress</h2>
      <form action={formAction} className="mt-4 space-y-4">
        <SpoilerLevelControl name="progress" defaultValue={progress} label="How far you have played" onChange={setLevel} />
        <FieldError message={state && !state.ok ? state.error : null} />
        <SubmitButton label="Save progress" pendingLabel="Saving" tone="quiet" />
      </form>
    </section>
  );
}
