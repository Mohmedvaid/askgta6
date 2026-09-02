import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty } from "@/components/Empty";
import { ModerationRow } from "@/components/ModerationRow";
import { createSupabaseAdminClient, isAdmin } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Reports" };

type ReportRow = { target_type: "post" | "reply"; target_id: string; reason: string; note: string | null };

export default async function AdminReportsPage() {
  const viewer = await getViewer();
  if (!isAdmin(viewer?.userId)) notFound();

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("reports")
    .select("target_type, target_id, reason, note")
    .order("created_at", { ascending: false })
    .limit(200);

  const grouped = new Map<string, { row: ReportRow; count: number; reasons: Set<string> }>();
  for (const row of (data ?? []) as ReportRow[]) {
    const key = `${row.target_type}:${row.target_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.reasons.add(row.reason);
    } else {
      grouped.set(key, { row, count: 1, reasons: new Set([row.reason]) });
    }
  }

  const entries = [...grouped.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">Reports</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Content reaches five distinct reporters and hides itself. Everything below is still up unless it says otherwise.
        </p>
      </header>

      {entries.length === 0 ? (
        <Empty title="Nothing reported" body="The queue is empty." />
      ) : (
        <ul className="space-y-4">
          {entries.map((entry) => (
            <li key={`${entry.row.target_type}:${entry.row.target_id}`} className="rounded-lg border border-border bg-surface-1 p-5">
              <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                <span className="font-semibold text-text-secondary uppercase">{entry.row.target_type}</span>
                <span>
                  {entry.count} {entry.count === 1 ? "report" : "reports"}
                </span>
                <span>{[...entry.reasons].join(", ")}</span>
                {entry.row.target_type === "post" ? (
                  <Link href={`/p/${entry.row.target_id}`} className="font-semibold text-text-secondary">
                    Open
                  </Link>
                ) : null}
              </div>
              {entry.row.note ? <p className="mt-3 text-sm text-text-secondary">{entry.row.note}</p> : null}
              <ModerationRow targetType={entry.row.target_type} targetId={entry.row.target_id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
