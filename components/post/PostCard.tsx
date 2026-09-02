import Link from "next/link";
import { SpoilerBadge } from "../SpoilerBadge";
import { TopicBadge } from "../TopicBadge";
import { RevealRegion } from "./RevealRegion";
import { excerpt } from "@/lib/markdown";
import { relativeTime } from "@/lib/relative-time";
import type { GatedPost } from "@/lib/queries/posts";

/**
 * One feed card. A hidden post reaches here with no title and no body at all,
 * so the placeholder is the only thing that can be rendered for it.
 */
export function PostCard({ post }: { post: GatedPost }) {
  return (
    <article className="border-b border-border py-6 first:pt-0 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <TopicBadge topic={post.topic} />
        {post.kind === "question" ? (
          <span className="text-xs font-semibold tracking-wide text-accent uppercase">Question</span>
        ) : null}
        <SpoilerBadge level={post.spoiler_level} tone={post.hidden ? "loud" : "quiet"} />
        {post.group ? (
          <Link href={`/g/${post.group.slug}`} className="text-xs font-medium text-text-muted">
            {post.group.name}
          </Link>
        ) : null}
      </div>

      <div className="mt-3">
        {post.hidden ? (
          <RevealRegion target={{ type: "post", id: post.id }} variant="card" />
        ) : (
          <Link href={`/p/${post.id}`} className="group block">
            <h2 className="font-display text-xl leading-snug font-semibold text-text-primary group-hover:text-accent">
              {post.title}
            </h2>
            <p className="mt-1.5 text-sm text-text-secondary">{excerpt(post.body)}</p>
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <Link href={`/u/${post.author.username}`} className="font-medium text-text-secondary">
          {post.author.display_name ?? post.author.username}
        </Link>
        <span>{relativeTime(post.created_at)}</span>
        <span>
          {post.vote_count} {post.vote_count === 1 ? "vote" : "votes"}
        </span>
        <Link href={`/p/${post.id}`}>
          {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
        </Link>
        {post.accepted_reply_id ? <span className="font-semibold text-success">Answered</span> : null}
      </div>
    </article>
  );
}
