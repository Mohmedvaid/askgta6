import { indexingEnabled, postIsIndexable, groupIsIndexable } from "./indexing";
import { absoluteUrl } from "./site";
import type { GatedPost, PostAuthor } from "./queries/posts";
import type { GatedReply } from "./queries/replies";
import type { GroupRow } from "./queries/groups";

export type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";

function person(author: PostAuthor | undefined): JsonLd | undefined {
  if (!author?.username) return undefined;
  return {
    "@type": "Person",
    name: author.display_name || author.username,
    url: absoluteUrl(`/u/${author.username}`),
  };
}

function counter(interactionType: string, count: number): JsonLd {
  return {
    "@type": "InteractionCounter",
    interactionType: `${CONTEXT}/${interactionType}`,
    userInteractionCount: Math.max(0, count ?? 0),
  };
}

/** A sealed body was never sent to the page, so it can never reach the markup. */
function bodyOf(item: { hidden: boolean; body?: string }): string | undefined {
  return item.hidden ? undefined : item.body;
}

function answer(reply: GatedReply, postId: string): JsonLd {
  return {
    "@type": "Answer",
    text: bodyOf(reply),
    url: absoluteUrl(`/p/${postId}#reply-${reply.id}`),
    dateCreated: reply.created_at,
    upvoteCount: Math.max(0, reply.vote_count ?? 0),
    author: person(reply.author),
  };
}

/**
 * The structured data for a post page, or null when the page is not indexable.
 *
 * A question with a readable accepted answer becomes a QAPage, because that is
 * the shape search engines understand for it. Anything else, including a question
 * whose accepted answer is sealed for this reader, is a DiscussionForumPosting.
 * No branch ever emits a gated body: the gate deleted it upstream and bodyOf
 * refuses to guess.
 */
export function postJsonLd(post: GatedPost, replies: readonly GatedReply[]): JsonLd | null {
  if (!indexingEnabled() || !postIsIndexable(post)) return null;

  const url = absoluteUrl(`/p/${post.id}`);
  const accepted = post.accepted_reply_id
    ? replies.find((reply) => reply.id === post.accepted_reply_id)
    : undefined;

  const common = {
    "@context": CONTEXT,
    "@id": url,
    url,
    author: person(post.author),
    dateCreated: post.created_at,
  };

  const stats = [counter("LikeAction", post.vote_count), counter("CommentAction", post.reply_count)];

  // A QAPage is only honest when both halves are readable. A question whose own
  // body is sealed for this reader falls through to the forum posting shape.
  if (post.kind === "question" && accepted && !accepted.hidden && !post.hidden) {
    return {
      ...common,
      "@type": "QAPage",
      mainEntity: {
        "@type": "Question",
        name: post.title,
        text: bodyOf(post),
        url,
        dateCreated: post.created_at,
        author: person(post.author),
        answerCount: Math.max(0, post.reply_count ?? 0),
        upvoteCount: Math.max(0, post.vote_count ?? 0),
        interactionStatistic: stats,
        acceptedAnswer: answer(accepted, post.id),
      },
    };
  }

  return {
    ...common,
    "@type": "DiscussionForumPosting",
    headline: post.title,
    name: post.title,
    text: bodyOf(post),
    datePublished: post.created_at,
    interactionStatistic: stats,
  };
}

/** A public group page is a collection of its threads, and nothing more. */
export function groupJsonLd(group: GroupRow | null): JsonLd | null {
  if (!group || !indexingEnabled() || !groupIsIndexable(group)) return null;

  const url = absoluteUrl(`/g/${group.slug}`);
  return {
    "@context": CONTEXT,
    "@type": "CollectionPage",
    "@id": url,
    url,
    name: group.name,
    description: group.description ?? undefined,
    dateCreated: group.created_at,
  };
}
