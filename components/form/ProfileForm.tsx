"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { saveProfile } from "@/actions/profile";
import { normalizeUsername } from "@/lib/username";
import { BIO_MAX_LENGTH, USERNAME_COOLDOWN_DAYS, usernameCooldownEndsAt } from "@/lib/profile-rules";

const inputClass =
  "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted";

type ProfileFormProps = {
  username: string;
  displayName: string | null;
  bio: string | null;
  usernameChangedAt: string | null;
};

/**
 * Username, display name, bio, and nothing else. There is deliberately no email
 * field: the address on an account cannot be changed from here or anywhere else.
 */
export function ProfileForm({ username, displayName, bio, usernameChangedAt }: ProfileFormProps) {
  const [state, formAction] = useActionState(saveProfile, null);
  const [name, setName] = useState(username);
  const [bioText, setBioText] = useState(bio ?? "");
  const cooldownEndsAt = usernameCooldownEndsAt(usernameChangedAt);

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
        <p className="mt-1 text-xs text-text-muted">
          3 to 20 lowercase letters, digits, or underscores. This is how people see you everywhere on the site, so it
          can change once every {USERNAME_COOLDOWN_DAYS} days.
          {cooldownEndsAt ? ` Changeable again on ${cooldownEndsAt.toLocaleDateString()}.` : ""}
        </p>
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
        <p className="mt-1 text-xs text-text-muted">
          Optional, and secondary. It shows next to your username, never instead of it.
        </p>
      </div>

      <div>
        <label htmlFor="bio" className="text-sm font-semibold text-text-primary">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          value={bioText}
          onChange={(event) => setBioText(event.target.value.slice(0, BIO_MAX_LENGTH))}
          maxLength={BIO_MAX_LENGTH}
          className={`mt-2 ${inputClass}`}
        />
        <p className="mt-1 text-xs text-text-muted">
          {bioText.length} of {BIO_MAX_LENGTH} characters. Shown on your profile.
        </p>
      </div>

      <FieldError message={state && !state.ok ? state.error : null} />
      {state?.ok ? <p className="text-sm text-success">Saved.</p> : null}
      <SubmitButton label="Save profile" pendingLabel="Saving" />
    </form>
  );
}
