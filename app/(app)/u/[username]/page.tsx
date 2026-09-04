import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SpoilerBadge } from "@/components/SpoilerBadge";
import { PostList } from "@/components/post/PostList";
import { Empty } from "@/components/Empty";
import { RevealRegion } from "@/components/post/RevealRegion";
import { avatarUrl, getProfileByUsername } from "@/lib/queries/profiles";
import { listPosts } from "@/lib/queries/posts";
import { listRepliesByAuthor } from "@/lib/queries/replies";
import { getViewerProgress } from "@/lib/viewer";
import { renderMarkdown } from "@/lib/markdown";
import { monthAndYear, relativeTime } from "@/lib/relative-time";
import { profileIsIndexable, robotsFor } from "@/lib/indexing";

type Params = Promise<{ username: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  return { title: username, robots: robotsFor(profileIsIndexable(Boolean(profile))) };
}

export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { username } = await params;
  const query = await searchParams;
  const tab = query.tab === "replies" ? "replies" : "posts";

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const progress = await getViewerProgress();
  const url = await avatarUrl(profile.avatar_path);
  const posts = tab === "posts" ? await listPosts({ authorId: profile.id }, progress) : null;
  const replies = tab === "replies" ? await listRepliesByAuthor(profile.id, progress) : null;

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-5">
        <Avatar username={profile.username} url={url} size={72} />
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">{profile.username}</h1>
          {profile.display_name ? (
            <p className="text-sm text-text-secondary">{profile.display_name}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-text-muted">
            <span>Member since {monthAndYear(profile.created_at)}</span>
            <SpoilerBadge level={profile.progress} />
          </div>
        </div>
      </header>

      {profile.bio ? <p className="max-w-2xl text-sm text-text-secondary">{profile.bio}</p> : null}

      <nav aria-label="Profile sections" className="flex gap-6 border-b border-border">
        {[
          { id: "posts", label: "Posts" },
          { id: "replies", label: "Replies" },
        ].map((item) => (
          <Link
            key={item.id}
            href={item.id === "posts" ? `/u/${username}` : `/u/${username}?tab=replies`}
            aria-current={tab === item.id ? "page" : undefined}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold ${
              tab === item.id ? "border-accent text-text-primary" : "border-transparent text-text-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {posts ? (
        <PostList
          page={posts}
          moreHref={null}
          emptyTitle="No posts yet"
          emptyBody={`${profile.username} has not started a thread.`}
        />
      ) : null}

      {replies ? (
        replies.length === 0 ? (
          <Empty title="No replies yet" body={`${profile.username} has not answered anything.`} />
        ) : (
          <ul className="space-y-5">
            {replies.map((reply) => (
              <li key={reply.id} className="border-b border-border pb-5 last:border-b-0">
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span>{relativeTime(reply.created_at)}</span>
                  <SpoilerBadge level={reply.spoiler_level} tone={reply.hidden ? "loud" : "quiet"} />
                  <Link href={`/p/${reply.post_id}`} className="font-semibold text-text-secondary">
                    Open thread
                  </Link>
                </div>
                <div className="mt-2">
                  {reply.hidden ? (
                    <RevealRegion
                      target={{ type: "reply", id: reply.id }}
                      variant="card"
                      spoilerLevel={reply.spoiler_level}
                    />
                  ) : (
                    <div
                      className="prose-body text-sm"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(reply.body) }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
