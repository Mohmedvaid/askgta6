"use client";

import { useActionState } from "react";
import { SubmitButton } from "../form/SubmitButton";
import { FieldError } from "../form/FieldError";
import { setBanned } from "@/actions/admin";

/**
 * Ban writes `profiles.banned_at`, which `public.is_banned()` reads, and that
 * function sits inside the insert policies for posts, replies, groups, and reports
 * and inside cast_vote. So this button is not what stops a banned account writing.
 * Postgres is. This only asks it to.
 */
export function BanControl({ userId, banned }: { userId: string; banned: boolean }) {
  const [state, formAction] = useActionState(setBanned, null);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value={banned ? "unban" : "ban"} />
      {banned ? null : (
        <input
          name="reason"
          placeholder="Reason, for the audit log"
          maxLength={200}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
        />
      )}
      <SubmitButton
        label={banned ? "Unban" : "Ban author"}
        pendingLabel="Working"
        tone={banned ? "quiet" : "danger"}
      />
      <FieldError message={state && !state.ok ? state.error : null} />
      {state?.ok ? <span className="text-sm text-success">Done.</span> : null}
    </form>
  );
}
