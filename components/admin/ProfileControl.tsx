"use client";

import { useActionState } from "react";
import { SubmitButton } from "../form/SubmitButton";
import { FieldError } from "../form/FieldError";
import { adminEditProfile } from "@/actions/admin";
import { normalizeUsername } from "@/lib/username";

/**
 * Rename an account, or clear its bio.
 *
 * Both are public surfaces somebody can put something vile on, and waiting for the
 * owner to fix it is not a plan. The thirty day cooldown does not apply to an admin.
 */
export function ProfileControl({ userId, username, hasBio }: { userId: string; username: string; hasBio: boolean }) {
  const [state, formAction] = useActionState(adminEditProfile, null);

  return (
    <div className="mt-3 space-y-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <label htmlFor={`rename-${userId}`} className="text-sm text-text-secondary">
          Rename
        </label>
        <input
          id={`rename-${userId}`}
          name="username"
          defaultValue={username}
          maxLength={20}
          onChange={(event) => {
            event.target.value = normalizeUsername(event.target.value);
          }}
          className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-text-primary"
        />
        <SubmitButton label="Save name" pendingLabel="Saving" tone="quiet" />
      </form>

      {hasBio ? (
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="clearBio" value="true" />
          <SubmitButton label="Clear bio" pendingLabel="Clearing" tone="quiet" />
        </form>
      ) : null}

      <FieldError message={state && !state.ok ? state.error : null} />
      {state?.ok ? <p className="text-sm text-success">Done.</p> : null}
    </div>
  );
}
