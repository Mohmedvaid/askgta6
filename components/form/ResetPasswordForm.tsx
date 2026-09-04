"use client";

import { useActionState } from "react";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { updatePassword } from "@/app/auth/actions";

const inputClass =
  "mt-2 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted";

/** The new password form. Only rendered once /auth/reset has checked the session. */
export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePassword, null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary">Set a new password</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Eight characters or more. You stay signed in on this device once it is saved.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="password" className="text-sm font-semibold text-text-primary">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="confirm" className="text-sm font-semibold text-text-primary">
            Confirm it
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>

        <FieldError message={state && !state.ok ? state.error : null} />
        <SubmitButton label="Save password" pendingLabel="Saving" />
      </form>
    </div>
  );
}
