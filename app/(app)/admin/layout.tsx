import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { NOINDEX } from "@/lib/indexing";

export const metadata = { robots: NOINDEX };

const TABS = [
  ["/admin", "Overview"],
  ["/admin/reports", "Reports"],
  ["/admin/users", "Users"],
  ["/admin/content", "Posts and groups"],
] as const;

/**
 * One gate for the whole section. notFound rather than a redirect, so a reader who
 * is not an admin cannot tell the difference between "you may not" and "there is
 * nothing here". Every action underneath re-checks anyway.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await requireAdmin())) notFound();

  return (
    <div className="space-y-8">
      <nav aria-label="Admin" className="flex flex-wrap gap-2 border-b border-border pb-4">
        {TABS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-text-secondary"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
