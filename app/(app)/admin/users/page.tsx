import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { BanControl } from "@/components/admin/BanControl";
import { DeleteAccountControl } from "@/components/admin/DeleteAccountControl";
import { ProfileControl } from "@/components/admin/ProfileControl";
import { findUsers } from "@/lib/queries/admin";
import { relativeTime } from "@/lib/relative-time";
import { NOINDEX } from "@/lib/indexing";

export const metadata: Metadata = { title: "Users", robots: NOINDEX };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const users = await findUsers(query);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary">Users</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Search by username, or by email with an @ in it. Empty shows the newest accounts.
        </p>
      </header>

      <form className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          Search users
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="username or email"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text"
        >
          Search
        </button>
      </form>

      {users.length === 0 ? (
        <Empty title="Nobody matches" body="Try a different spelling, or clear the search." />
      ) : (
        <ul className="space-y-4">
          {users.map((user) => (
            <li key={user.id} className="rounded-lg border border-border bg-surface-1 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/u/${user.username}`} className="font-display font-semibold text-text-primary">
                  {user.username}
                </Link>
                {user.isAdmin ? (
                  <span className="rounded-sm bg-accent-bg px-2 py-0.5 text-xs font-semibold text-accent">
                    Admin
                  </span>
                ) : null}
                {user.bannedAt ? (
                  <span className="rounded-sm bg-spoiler-bg px-2 py-0.5 text-xs font-semibold text-spoiler">
                    Banned {relativeTime(user.bannedAt)}
                  </span>
                ) : null}
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
                <div className="flex gap-1">
                  <dt>Email</dt>
                  <dd className="text-text-secondary">{user.email ?? "unknown"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Joined</dt>
                  <dd className="text-text-secondary">{user.createdAt ? relativeTime(user.createdAt) : "unknown"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Posts</dt>
                  <dd className="text-text-secondary">{user.postCount}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Reported posts</dt>
                  <dd className="text-text-secondary">{user.reportsAgainst}</dd>
                </div>
              </dl>

              {user.bio ? <p className="mt-2 text-sm text-text-secondary">{user.bio}</p> : null}
              {user.bannedReason ? (
                <p className="mt-2 text-xs text-text-muted">Reason: {user.bannedReason}</p>
              ) : null}

              <ProfileControl userId={user.id} username={user.username} hasBio={Boolean(user.bio)} />

              {user.isAdmin ? (
                <p className="mt-3 text-xs text-text-muted">
                  An admin cannot be banned or deleted from here. Take the flag off the row first.
                </p>
              ) : (
                <>
                  <BanControl userId={user.id} banned={Boolean(user.bannedAt)} />
                  <DeleteAccountControl userId={user.id} username={user.username} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
