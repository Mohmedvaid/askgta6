import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { ModerationRow } from "@/components/ModerationRow";
import { listRecentGroups, listRecentPosts } from "@/lib/queries/admin";
import { relativeTime } from "@/lib/relative-time";
import { NOINDEX } from "@/lib/indexing";

export const metadata: Metadata = { title: "Posts and groups", robots: NOINDEX };

export default async function AdminContentPage() {
  const [posts, groups] = await Promise.all([listRecentPosts(), listRecentGroups()]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-3xl font-bold text-text-primary">Recent posts</h1>
        <p className="mt-2 text-sm text-text-secondary">The newest fifty, hidden ones included.</p>

        {posts.length === 0 ? (
          <div className="mt-6">
            <Empty title="No posts yet" body="Nothing has been written." />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="rounded-lg border border-border bg-surface-1 p-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                  {post.isHidden ? (
                    <span className="rounded-sm bg-spoiler-bg px-2 py-0.5 font-semibold text-spoiler">Hidden</span>
                  ) : null}
                  <span>{post.authorUsername ?? "deleted account"}</span>
                  <span>{relativeTime(post.createdAt)}</span>
                  <Link href={`/p/${post.id}`} className="font-semibold text-text-secondary">
                    Open
                  </Link>
                </div>
                <h2 className="mt-2 font-display font-semibold text-text-primary">{post.title}</h2>
                <ModerationRow targetType="post" targetId={post.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold text-text-primary">Recent groups</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Groups are deleted by their owner. There is no admin delete here yet, because taking a room away from its
          members without a way to tell them is worse than leaving it up.
        </p>

        {groups.length === 0 ? (
          <div className="mt-6">
            <Empty title="No groups yet" body="Nobody has made one." />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {groups.map((group) => (
              <li key={group.id} className="rounded-lg border border-border bg-surface-1 p-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                  <span className="font-semibold text-text-secondary uppercase">{group.visibility}</span>
                  <span>
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </span>
                  <span>{relativeTime(group.createdAt)}</span>
                  <Link href={`/g/${group.slug}`} className="font-semibold text-text-secondary">
                    Open
                  </Link>
                </div>
                <h3 className="mt-2 font-display font-semibold text-text-primary">{group.name}</h3>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
