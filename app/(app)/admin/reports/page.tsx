import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { ModerationRow } from "@/components/ModerationRow";
import { BanControl } from "@/components/admin/BanControl";
import { listReportedItems } from "@/lib/queries/admin";
import { NOINDEX } from "@/lib/indexing";

export const metadata: Metadata = { title: "Reports", robots: NOINDEX };

export default async function AdminReportsPage() {
  const items = await listReportedItems();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">Reports</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Grouped by the item reported, not by report. Five distinct reporters hides something automatically, so
          anything already hidden is at the top.
        </p>
      </header>

      {items.length === 0 ? (
        <Empty title="Nothing reported" body="The queue is empty." />
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={`${item.targetType}:${item.targetId}`}
              className="rounded-lg border border-border bg-surface-1 p-5"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-semibold text-text-secondary uppercase">{item.targetType}</span>
                {item.isHidden ? (
                  <span className="rounded-sm bg-spoiler-bg px-2 py-0.5 font-semibold text-spoiler">
                    Auto hidden
                  </span>
                ) : null}
                <span className="text-text-muted">
                  {item.reporterCount} {item.reporterCount === 1 ? "reporter" : "reporters"}
                </span>
                <span className="text-text-muted">{item.reasons.join(", ")}</span>
                {item.targetType === "post" ? (
                  <Link href={`/p/${item.targetId}`} className="font-semibold text-text-secondary">
                    Open
                  </Link>
                ) : null}
              </div>

              <h2 className="mt-3 font-display text-lg font-semibold text-text-primary">{item.title}</h2>
              <p className="mt-2 text-sm text-text-secondary">{item.excerpt}</p>

              {item.notes.length > 0 ? (
                <ul className="mt-3 space-y-1 border-l border-border pl-3 text-xs text-text-muted">
                  {item.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              ) : null}

              <ModerationRow
                targetType={item.targetType}
                targetId={item.targetId}
                actions={["dismiss", "hide", "unhide", "delete"]}
              />

              {item.authorId ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs text-text-muted">
                    Written by{" "}
                    {item.authorUsername ? (
                      <Link href={`/u/${item.authorUsername}`} className="font-semibold text-text-secondary">
                        {item.authorUsername}
                      </Link>
                    ) : (
                      "a deleted account"
                    )}
                  </p>
                  <BanControl userId={item.authorId} banned={false} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
