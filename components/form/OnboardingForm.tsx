"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SpoilerLevelControl } from "../SpoilerLevelControl";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { completeOnboarding } from "@/actions/onboarding";
import { normalizeUsername } from "@/lib/username";
import { track } from "@/lib/analytics";

export function OnboardingForm({ progress }: { progress: number }) {
  const router = useRouter();
  const [state, formAction] = useActionState(completeOnboarding, null);
  const [name, setName] = useState("");
  const [level, setLevel] = useState(progress);

  useEffect(() => {
    if (!state?.ok) return;
    track("signup_completed", { method: "password" });
    track("progress_set", { level, source: "onboarding" });
    router.push("/feed");
  }, [state, level, router]);

  return (
    <form action={formAction} className="space-y-8">
      <div>
        <label htmlFor="username" className="text-sm font-semibold text-text-primary">
          Username
        </label>
        <input
          id="username"
          name="username"
          value={name}
          onChange={(event) => setName(normalizeUsername(event.target.value))}
          required
          maxLength={20}
          placeholder="vicecitylocal"
          className="mt-2 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
        <p className="mt-1 text-xs text-text-muted">3 to 20 lowercase letters, digits, or underscores.</p>
      </div>

      <SpoilerLevelControl
        name="progress"
        defaultValue={progress}
        onChange={setLevel}
        label="How far have you played"
        hint="Before launch, leave this at the first level."
      />

      <FieldError message={state && !state.ok ? state.error : null} />
      <SubmitButton label="Start reading" pendingLabel="Saving" />
    </form>
  );
}
