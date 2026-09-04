"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "./SubmitButton";
import { Honeypot } from "./Honeypot";
import { requestPasswordReset } from "@/app/auth/actions";

/**
 * There is no error state here on purpose. The action answers the same way for an
 * address that has an account, one that does not, a malformed one, and a Supabase
 * failure, so this form has exactly two states: asking, and the one confirmation.
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, null);

  if (state?.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Check your inbox</h1>
          <p className="mt-2 text-sm text-text-secondary">
            If that address has an account, a reset link is on its way. The link is good for one use and expires
            after an hour.
          </p>
        </div>
        <p className="text-sm text-text-muted">
          Nothing arrived? Check spam, then{" "}
          <Link href="/auth/forgot" className="font-semibold text-accent">
            try again
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary">Forgot your password</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Give us the email on the account and we will send a link to set a new password.
        </p>
      </div>

      <form action={formAction} className="relative space-y-4">
        <Honeypot />

        <div>
          <label htmlFor="email" className="text-sm font-semibold text-text-primary">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-2 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>

        <SubmitButton label="Send the link" pendingLabel="Sending" />
      </form>

      <p className="text-sm text-text-muted">
        Remembered it?{" "}
        <Link href="/auth/sign-in" className="font-semibold text-accent">
          Sign in
        </Link>
      </p>
    </div>
  );
}
