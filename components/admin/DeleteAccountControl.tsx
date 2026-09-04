"use client";

import { useActionState } from "react";
import { SubmitButton } from "../form/SubmitButton";
import { FieldError } from "../form/FieldError";
import { deleteAccount } from "@/actions/admin";

/**
 * Deleting an account cascades through every foreign key pointing at the auth user,
 * so the posts, replies, votes, and reports go too. There is no undo, which is why
 * the username has to be typed rather than a button being enough.
 */
export function DeleteAccountControl({ userId, username }: { userId: string; username: string }) {
  const [state, formAction] = useActionState(deleteAccount, null);

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold text-danger">Delete this account</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <label htmlFor={`confirm-${userId}`} className="text-sm text-text-secondary">
          Type <span className="font-mono font-semibold text-text-primary">{username}</span> to confirm
        </label>
        <input
          id={`confirm-${userId}`}
          name="confirm"
          autoComplete="off"
          className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-text-primary"
        />
        <SubmitButton label="Delete permanently" pendingLabel="Deleting" tone="danger" />
      </form>
      <FieldError message={state && !state.ok ? state.error : null} />
      {state?.ok ? <p className="mt-2 text-sm text-success">Deleted.</p> : null}
    </details>
  );
}
