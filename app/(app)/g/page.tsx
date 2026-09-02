import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { getViewer } from "@/lib/viewer";
import { listDiscoverableGroups, listMyGroups, type GroupRow } from "@/lib/queries/groups";

export const metadata: Metadata = { title: "Groups" };

function GroupCard({ group }: { group: GroupRow }) {
  return (
    <Link
      href={`/g/${group.slug}`}
      className="block rounded-lg border border-border bg-surface-1 p-5 hover:border-border-strong"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-text-primary">{group.name}</h3>
        {group.visibility === "private" ? (
          <span className="rounded-sm border border-border px-2 py-0.5 text-xs text-text-muted">Private</span>
        ) : null}
      </div>
      {group.description ? <p className="mt-2 text-sm text-text-secondary">{group.description}</p> : null}
      <p className="mt-3 text-xs text-text-muted">
        {group.member_count} {group.member_count === 1 ? "member" : "members"}
      </p>
    </Link>
  );
}

export default async function GroupsPage() {
  const viewer = await getViewer();
  const [mine, discover] = await Promise.all([
    viewer ? listMyGroups(viewer.userId) : Promise.resolve([]),
    listDiscoverableGroups(),
  ]);
  const mineIds = new Set(mine.map((group) => group.id));

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-text-primary">Groups</h1>
          <p className="mt-2 text-sm text-text-secondary">Smaller rooms for a crew, a schedule, or a playthrough.</p>
        </div>
        <Link
          href="/g/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text"
        >
          Create a group
        </Link>
      </header>

      {viewer ? (
        <section>
          <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Your groups</h2>
          {mine.length === 0 ? (
            <div className="mt-4">
              <Empty title="No groups yet" body="Join a public group below, or start your own." />
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {mine.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Discover</h2>
        {discover.filter((group) => !mineIds.has(group.id)).length === 0 ? (
          <div className="mt-4">
            <Empty title="Nothing to discover yet" body="Create the first public group." actionLabel="Create a group" actionHref="/g/new" />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {discover
              .filter((group) => !mineIds.has(group.id))
              .map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
