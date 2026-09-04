import Link from "next/link";
import { SpoilerBadge } from "../SpoilerBadge";
import { RevealRegion } from "../post/RevealRegion";
import { VoteControl } from "../post/VoteControl";
import { renderMarkdown } from "@/lib/markdown";
import { relativeTime } from "@/lib/relative-time";
import type { GatedReply } from "@/lib/queries/replies";

type ReplyItemProps = {
  reply: GatedReply;
  myVote: number;
  accepted: boolean;
  canAccept: boolean;
  isAuthor: boolean;
  acceptAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  /** The canonical path of the thread, so the actions revalidate the page in view. */
  path: string;
};

export function ReplyItem({
  reply,
  myVote,
  accepted,
  canAccept,
  isAuthor,
  acceptAction,
  deleteAction,
  path,
}: ReplyItemProps) {
  return (
    <article
      id={`reply-${reply.id}`}
      className={
        accepted
          ? "rounded-lg border border-success bg-surface-1 p-5"
          : "border-b border-border py-5 last:border-b-0"
      }
    >
      {accepted ? (
        <p className="mb-3 text-xs font-semibold tracking-wide text-success uppercase">Accepted answer</p>
      ) : null}

      <div className="flex gap-4">
        <VoteControl targetType="reply" targetId={reply.id} count={reply.vote_count} myVote={myVote} path={path} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <Link href={`/u/${reply.author.username}`} className="font-medium text-text-secondary">
              {reply.author.username}
            </Link>
            <span>{relativeTime(reply.created_at)}</span>
            <SpoilerBadge level={reply.spoiler_level} tone={reply.hidden ? "loud" : "quiet"} />
          </div>

          {reply.hidden ? (
            <RevealRegion target={{ type: "reply", id: reply.id }} variant="card" spoilerLevel={reply.spoiler_level} />
          ) : (
            <div
              className="prose-body mt-2 text-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(reply.body) }}
            />
          )}

          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            {canAccept ? (
              <form action={acceptAction}>
                <input type="hidden" name="postId" value={reply.post_id} />
                <input type="hidden" name="replyId" value={accepted ? "" : reply.id} />
                <input type="hidden" name="path" value={path} />
                <button type="submit" className="font-semibold text-text-secondary">
                  {accepted ? "Unmark answer" : "Mark as answer"}
                </button>
              </form>
            ) : null}

            {isAuthor ? (
              <form action={deleteAction}>
                <input type="hidden" name="replyId" value={reply.id} />
                <input type="hidden" name="postId" value={reply.post_id} />
                <input type="hidden" name="path" value={path} />
                <button type="submit" className="font-semibold text-danger">
                  Delete
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
