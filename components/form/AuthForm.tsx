"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "./SubmitButton";
import { FieldError } from "./FieldError";
import { Honeypot } from "./Honeypot";
import { signIn, signInWithProvider, signUp } from "@/app/auth/actions";

const inputClass =
  "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
  next?: string;
  discordEnabled: boolean;
  googleEnabled: boolean;
};

/**
 * Email and password, plus the two OAuth buttons when their flags are on.
 *
 * There used to be an "Or get a sign in link" form under this one. It was removed
 * in September 2026 pending SMTP; the action behind it is still in
 * app/auth/actions.ts with the whole story, and lib/auth-features.ts holds the flag
 * that keeps it unreachable. Restoring the form is half of turning it back on.
 */
export function AuthForm({ mode, next, discordEnabled, googleEnabled }: AuthFormProps) {
  const signingIn = mode === "sign-in";
  const [state, formAction] = useActionState(signingIn ? signIn : signUp, null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary">
          {signingIn ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {signingIn
            ? "Email and password. You land back at the spoiler level you set."
            : "Set how far you have played and the site hides everything past it."}
        </p>
      </div>

      <form action={formAction} className="relative space-y-4">
        {signingIn ? null : <Honeypot />}
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div>
          <label htmlFor="email" className="text-sm font-semibold text-text-primary">
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={`mt-2 ${inputClass}`} />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-sm font-semibold text-text-primary">
              Password
            </label>
            {signingIn ? (
              <Link href="/auth/forgot" className="text-sm font-medium text-accent">
                Forgot password?
              </Link>
            ) : null}
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={signingIn ? "current-password" : "new-password"}
            className={`mt-2 ${inputClass}`}
          />
        </div>

        <FieldError message={state && !state.ok ? state.error : null} />
        {state?.ok && !signingIn ? (
          <p className="text-sm text-success">Check your inbox to confirm the address.</p>
        ) : null}
        <SubmitButton label={signingIn ? "Sign in" : "Create account"} pendingLabel="Working" />
      </form>

      {discordEnabled || googleEnabled ? (
        <div className="space-y-3 border-t border-border pt-6">
          {discordEnabled ? (
            <form action={signInWithProvider}>
              <input type="hidden" name="provider" value="discord" />
              <button type="submit" className="w-full rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-secondary">
                Continue with Discord
              </button>
            </form>
          ) : null}
          {googleEnabled ? (
            <form action={signInWithProvider}>
              <input type="hidden" name="provider" value="google" />
              <button type="submit" className="w-full rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-secondary">
                Continue with Google
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-text-muted">
        {signingIn ? "No account yet? " : "Already have an account? "}
        <Link href={signingIn ? "/auth/sign-up" : "/auth/sign-in"} className="font-semibold text-accent">
          {signingIn ? "Create one" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
