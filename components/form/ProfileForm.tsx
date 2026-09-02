"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { saveProfile } from "@/actions/profile";
import { normalizeUsername } from "@/lib/username";

const inputClass =
  "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted";

export function ProfileForm({ username, displayName }: { username: string; displayName: string | null }) {
  const [state, formAction] = useActionState(saveProfile, null);
  const [name, setName] = useState(username);

  return (
    <form action={formAction} className="space-y-5">
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
          className={`mt-2 ${inputClass}`}
        />
        <p className="mt-1 text-xs text-text-muted">3 to 20 lowercase letters, digits, or underscores.</p>
      </div>

      <div>
        <label htmlFor="displayName" className="text-sm font-semibold text-text-primary">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName ?? ""}
          maxLength={40}
          className={`mt-2 ${inputClass}`}
        />
      </div>

      <FieldError message={state && !state.ok ? state.error : null} />
      {state?.ok ? <p className="text-sm text-success">Saved.</p> : null}
      <SubmitButton label="Save profile" pendingLabel="Saving" />
    </form>
  );
}
