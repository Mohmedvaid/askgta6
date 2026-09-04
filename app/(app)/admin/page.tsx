import type { Metadata } from "next";
import Link from "next/link";
import { StatBar } from "@/components/admin/StatBar";
import { getDailyCounts, getTotals } from "@/lib/queries/admin";
import { NOINDEX } from "@/lib/indexing";

export const metadata: Metadata = { title: "Admin", robots: NOINDEX };

export default async function AdminOverviewPage() {
  const [days, totals] = await Promise.all([getDailyCounts(), getTotals()]);

  const tiles = [
    ["Accounts", totals.profiles],
    ["Posts", totals.posts],
    ["Replies", totals.replies],
    ["Groups", totals.groups],
    ["Banned", totals.banned],
    ["Hidden posts", totals.hidden_posts],
    ["Hidden replies", totals.hidden_replies],
  ] as const;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">Overview</h1>
        <p className="mt-2 text-sm text-text-secondary">The last 30 days, and the totals behind them.</p>
      </header>

      {totals.reported_items > 0 ? (
        <Link
          href="/admin/reports"
          className="block rounded-lg border border-spoiler bg-spoiler-bg/40 p-5 text-sm font-semibold text-spoiler"
        >
          {totals.reported_items} {totals.reported_items === 1 ? "item is" : "items are"} in the report queue
        </Link>
      ) : (
        <p className="rounded-lg border border-border bg-surface-1 p-5 text-sm text-text-secondary">
          Nothing in the report queue.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface-1 p-4">
            <div className="text-xs font-semibold tracking-widest text-text-muted uppercase">{label}</div>
            <div className="mt-2 font-display text-2xl font-bold text-text-primary">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <StatBar label="Signups" days={days.map((d) => ({ day: d.day, value: d.signups }))} />
        <StatBar label="Posts" days={days.map((d) => ({ day: d.day, value: d.posts }))} />
        <StatBar label="Replies" days={days.map((d) => ({ day: d.day, value: d.replies }))} />
      </div>
    </div>
  );
}
