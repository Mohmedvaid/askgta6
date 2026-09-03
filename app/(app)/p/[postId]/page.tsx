import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SpoilerBadge } from "@/components/SpoilerBadge";
import { TopicBadge } from "@/components/TopicBadge";
import { PostBody } from "@/components/post/PostBody";
import { RevealRegion } from "@/components/post/RevealRegion";
import { VoteControl } from "@/components/post/VoteControl";
import { ReplyItem } from "@/components/reply/ReplyItem";
import { ReplyComposer } from "@/components/form/ReplyComposer";
import { ReportDialog } from "@/components/form/ReportDialog";
import { Empty } from "@/components/Empty";
import { getPost } from "@/lib/queries/posts";
import { listReplies } from "@/lib/queries/replies";
import { getViewer, getViewerProgress } from "@/lib/viewer";
import { getMyVote } from "@/actions/votes";
import { acceptReply, deletePost } from "@/actions/posts";
import { deleteReply } from "@/actions/replies";
import { relativeTime } from "@/lib/relative-time";
import { postIsIndexable, robotsFor } from "@/lib/indexing";

type Params = Promise<{ postId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { postId } = await params;
  // Metadata is generated at level 0 on purpose, so a link preview can never spoil.
  const post = await getPost(postId, 0);
  if (!post) return { title: "Post not found", robots: robotsFor(false) };

  // Titles are visible at every level, so the real one goes in the preview.
  // The description never quotes the body, which is the part that is gated.
  const title = post.title;
  const description = `A ${post.kind} in ${post.topic} on AskGTA6.`;

  return {
    title,
    description,
    robots: robotsFor(postIsIndexable(post)),
    openGraph: {
      title,
      description,
      images: [{ url: `/p/${postId}/opengraph-image`, width: 1200, height: 630 }],
    },
  };
}

export default async function PostPage({ params }: { params: Params }) {
  const { postId } = await params;
  const viewer = await getViewer();
  const progress = await getViewerProgress();
  const post = await getPost(postId, progress);
  if (!post) notFound();

  const replies = await listReplies(postId, progress, post.accepted_reply_id);
  const myPostVote = await getMyVote("post", postId);
  const replyVotes = await Promise.all(replies.map((reply) => getMyVote("reply", reply.id)));
  const isAuthor = viewer?.userId === post.author_id;

  return (
    <div className="space-y-10">
      <article>
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

        <div className="mt-5 flex gap-5">
          <VoteControl targetType="post" targetId={post.id} count={post.vote_count} myVote={myPostVote} />

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl leading-tight font-bold text-text-primary">{post.title}</h1>

            {post.hidden ? (
              <RevealRegion target={{ type: "post", id: post.id }} variant="full" spoilerLevel={post.spoiler_level} />
            ) : (
              <PostBody body={post.body} />
            )}

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
              <Link href={`/u/${post.author.username}`} className="font-medium text-text-secondary">
                {post.author.display_name ?? post.author.username}
              </Link>
              <span>{relativeTime(post.created_at)}</span>
              {isAuthor ? (
                <>
                  <Link href={`/p/${post.id}/edit`} className="font-semibold text-text-secondary">
                    Edit
                  </Link>
                  <form action={deletePost}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button type="submit" className="font-semibold text-danger">
                      Delete
                    </button>
                  </form>
                </>
              ) : null}
              {viewer ? <ReportDialog targetType="post" targetId={post.id} /> : null}
            </div>
          </div>
        </div>
      </article>

      <section>
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
        </h2>

        {replies.length === 0 ? (
          <div className="mt-4">
            <Empty title="No replies yet" body="Be the first to answer this one." />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {replies.map((reply, index) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                myVote={replyVotes[index] ?? 0}
                accepted={post.accepted_reply_id === reply.id}
                canAccept={isAuthor && post.kind === "question"}
                isAuthor={viewer?.userId === reply.author_id}
                acceptAction={acceptReply}
                deleteAction={deleteReply}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-border pt-8">
        {viewer ? (
          <ReplyComposer postId={post.id} defaultSpoilerLevel={progress} />
        ) : (
          <Empty
            title="Sign in to reply"
            body="Set how far you have played and join the thread."
            actionLabel="Sign in"
            actionHref="/auth/sign-in"
          />
        )}
      </section>
    </div>
  );
}
