import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { groupJsonLd, postJsonLd } from "@/lib/structured-data";
import { applySpoilerGate, applySpoilerGateAll, type ViewerProgress } from "@/lib/spoilers";
import type { PostRow } from "@/lib/queries/posts";
import type { ReplyRow } from "@/lib/queries/replies";
import type { GroupRow } from "@/lib/queries/groups";

const AUTHOR = { username: "vic", display_name: "Vic", avatar_path: null };

const POST: PostRow = {
  id: "post-1",
  author_id: "user-1",
  group_id: null,
  topic: "story",
  kind: "question",
  title: "Where does the second heist start",
  body: "Trailer two shows the approach but not the entry.",
  spoiler_level: 2,
  vote_count: 12,
  reply_count: 3,
  accepted_reply_id: "reply-1",
  is_hidden: false,
  created_at: "2026-02-01T10:00:00.000Z",
  author: AUTHOR,
  group: null,
};

const REPLY: ReplyRow = {
  id: "reply-1",
  post_id: "post-1",
  author_id: "user-2",
  body: "It starts from the marina, not the causeway.",
  spoiler_level: 2,
  vote_count: 7,
  is_hidden: false,
  created_at: "2026-02-01T12:00:00.000Z",
  author: { username: "mona", display_name: null, avatar_path: null },
};

const GROUP: GroupRow = {
  id: "group-1",
  slug: "map-nerds",
  name: "Map nerds",
  description: "Coastline, causeways, and the bits nobody has mapped.",
  visibility: "public",
  owner_id: "user-1",
  member_count: 41,
  created_at: "2026-01-05T00:00:00.000Z",
};

/** How the page sees them: gated at a level, then handed to the builder. */
function gate(post: PostRow, replies: ReplyRow[], level: ViewerProgress) {
  return {
    post: applySpoilerGate(post, level),
    replies: applySpoilerGateAll(replies, level),
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_INDEXING = "on";
  process.env.NEXT_PUBLIC_SITE_URL = "https://askgta6.test";
});

afterEach(() => {
  process.env.NEXT_PUBLIC_INDEXING = "off";
});

describe("postJsonLd", () => {
  it("emits a QAPage with an acceptedAnswer for an answered question", () => {
    const { post, replies } = gate(POST, [REPLY], "none");
    const data = postJsonLd(post, replies) as Record<string, unknown>;

    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("QAPage");

    const question = data.mainEntity as Record<string, unknown>;
    expect(question["@type"]).toBe("Question");
    expect(question.name).toBe(POST.title);
    expect(question.text).toBe(POST.body);
    expect(question.answerCount).toBe(3);
    expect(question.upvoteCount).toBe(12);
    expect(question.dateCreated).toBe(POST.created_at);
    expect(question.author).toEqual({
      "@type": "Person",
      name: "Vic",
      url: "https://askgta6.test/u/vic",
    });

    const accepted = question.acceptedAnswer as Record<string, unknown>;
    expect(accepted["@type"]).toBe("Answer");
    expect(accepted.text).toBe(REPLY.body);
    expect(accepted.upvoteCount).toBe(7);
    expect(accepted.url).toBe("https://askgta6.test/p/post-1#reply-reply-1");
    // A display name is optional, so the username stands in.
    expect((accepted.author as Record<string, unknown>).name).toBe("mona");
  });

  it("counts votes and replies as schema.org interaction counters", () => {
    const { post, replies } = gate({ ...POST, kind: "discussion" }, [REPLY], "none");
    const data = postJsonLd(post, replies) as Record<string, unknown>;

    expect(data["@type"]).toBe("DiscussionForumPosting");
    expect(data.headline).toBe(POST.title);
    expect(data.dateCreated).toBe(POST.created_at);
    expect(data.interactionStatistic).toEqual([
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: 12,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: 3,
      },
    ]);
  });

  it("never carries a gated body, in either shape", () => {
    // Reader at level 0, post and reply at level 2: both bodies are gone upstream.
    const { post, replies } = gate(POST, [REPLY], 0);
    const data = postJsonLd(post, replies);

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("Trailer two shows the approach");
    expect(serialized).not.toContain("marina");
    // Title survives, because titles are visible at every level.
    expect(serialized).toContain(POST.title);
  });

  it("falls back to a forum posting when the accepted answer is sealed", () => {
    const sealedAnswer = { ...REPLY, spoiler_level: 6 };
    const { post, replies } = gate({ ...POST, spoiler_level: 0 }, [sealedAnswer], 2);
    const data = postJsonLd(post, replies) as Record<string, unknown>;

    expect(data["@type"]).toBe("DiscussionForumPosting");
    expect(data.mainEntity).toBeUndefined();
  });

  it("stays a forum posting for a question with no accepted answer", () => {
    const { post, replies } = gate({ ...POST, accepted_reply_id: null }, [REPLY], "none");
    expect((postJsonLd(post, replies) as Record<string, never>)["@type"]).toBe("DiscussionForumPosting");
  });

  it("emits nothing for a post that is not indexable", () => {
    const hidden = gate({ ...POST, is_hidden: true }, [REPLY], "none");
    expect(postJsonLd(hidden.post, hidden.replies)).toBeNull();

    const privateGroup = gate(
      { ...POST, group: { slug: "inner", name: "Inner", visibility: "private" } },
      [REPLY],
      "none",
    );
    expect(postJsonLd(privateGroup.post, privateGroup.replies)).toBeNull();
  });

  it("emits nothing while indexing is off", () => {
    process.env.NEXT_PUBLIC_INDEXING = "off";
    const { post, replies } = gate(POST, [REPLY], "none");
    expect(postJsonLd(post, replies)).toBeNull();
  });
});

describe("groupJsonLd", () => {
  it("emits a minimal CollectionPage for a public group", () => {
    expect(groupJsonLd(GROUP)).toEqual({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": "https://askgta6.test/g/map-nerds",
      url: "https://askgta6.test/g/map-nerds",
      name: "Map nerds",
      description: GROUP.description,
      dateCreated: GROUP.created_at,
    });
  });

  it("emits nothing for a private group, a missing group, or indexing off", () => {
    expect(groupJsonLd({ ...GROUP, visibility: "private" })).toBeNull();
    expect(groupJsonLd(null)).toBeNull();

    process.env.NEXT_PUBLIC_INDEXING = "off";
    expect(groupJsonLd(GROUP)).toBeNull();
  });
});
