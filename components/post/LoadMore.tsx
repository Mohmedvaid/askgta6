import Link from "next/link";

/** A link, not infinite scroll. The URL carries the cursor so back works. */
export function LoadMore({ href }: { href: string }) {
  return (
    <div className="pt-8 text-center">
      <Link
        href={href}
        className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-secondary"
      >
        Load more
      </Link>
    </div>
  );
}
