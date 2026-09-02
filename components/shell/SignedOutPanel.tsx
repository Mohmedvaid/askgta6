import Link from "next/link";

export function SignedOutPanel() {
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Reading at level 0</h2>
      <p className="mt-3 text-sm text-text-secondary">
        Signed out visitors see trailer safe posts only. Create an account to set how far you have played and unlock
        the rest as you go.
      </p>
      <Link
        href="/auth/sign-up"
        className="mt-4 inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text"
      >
        Create an account
      </Link>
    </section>
  );
}
