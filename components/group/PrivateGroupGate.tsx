"use client";

import { useActionState } from "react";
import { SubmitButton } from "../form/SubmitButton";
import { FieldError } from "../form/FieldError";
import { redeemInvite } from "@/actions/groups";

/** Shown for a private group the viewer cannot see, and for a slug that does not exist. */
export function PrivateGroupGate() {
  const [state, formAction] = useActionState(redeemInvite, null);

  return (
    <div className="rounded-lg border border-border bg-surface-1 px-6 py-12 text-center">
      <h1 className="font-display text-2xl font-semibold text-text-primary">This group is private</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
        Members only. Paste an invite code to join.
      </p>

      <form action={formAction} className="mx-auto mt-6 flex max-w-xs flex-col gap-3">
        <label htmlFor="code" className="sr-only">
          Invite code
        </label>
        <input
          id="code"
          name="code"
          required
          placeholder="Invite code"
          className="rounded-md border border-border bg-surface-0 px-3 py-2 text-center text-sm tracking-widest text-text-primary uppercase placeholder:tracking-normal placeholder:normal-case placeholder:text-text-muted"
        />
        <FieldError message={state && !state.ok ? state.error : null} />
        <SubmitButton label="Join group" pendingLabel="Joining" />
      </form>
    </div>
  );
}
