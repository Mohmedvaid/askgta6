import Link from "next/link";
import type { ReactNode } from "react";

type EmptyProps = {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  children?: ReactNode;
};

/** Empty states name the space and offer one verb. */
export function Empty({ title, body, actionLabel, actionHref, children }: EmptyProps) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-1 px-6 py-12 text-center">
      <h2 className="font-display text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">{body}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-6 inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text"
        >
          {actionLabel}
        </Link>
      ) : null}
      {children}
    </div>
  );
}
