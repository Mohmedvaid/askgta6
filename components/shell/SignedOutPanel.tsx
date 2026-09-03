import Link from "next/link";

export function SignedOutPanel() {
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Reading as a guest</h2>
      <p className="mt-3 text-sm text-text-secondary">
        Your spoiler shield is kept in this browser. Create an account to carry it across devices, post, and reply.
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
