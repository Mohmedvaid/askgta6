import type { SeedFile } from "./types";

/**
 * What seed.json has to look like, declared rather than inferred.
 *
 * Inferring the schema from the file and then validating the file against it
 * would pass for any file, which is not a check. So the rules below are the
 * app's own constraints, restated where the importer can reach them: the same
 * title length, the same topic list, the same username pattern the database
 * would reject on. The point is that a bad file fails on a laptop with every
 * violation listed, rather than halfway through writing to production.
 */

export const TOPICS = ["story", "vehicles", "locations", "map", "characters", "help", "general"] as const;
export const KINDS = ["question", "discussion"] as const;

export const RULES = {
  username: "3 to 20 characters, lowercase letters, digits, underscores",
  displayName: "1 to 40 characters, or null",
  bio: "up to 200 characters, or null",
  title: "8 to 140 characters",
  body: "1 to 10000 characters",
  spoilerLevel: "integer 0 to 7",
  votes: "non negative integers",
  createdAt: "ISO 8601 timestamp",
} as const;

export type Violation = { path: string; problem: string };

const USERNAME = /^[a-z0-9_]{3,20}$/;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function optionalText(value: unknown, max: number): boolean {
  return value === null || (typeof value === "string" && value.length >= 1 && value.length <= max);
}

/**
 * Every violation, not the first one. A file with forty problems should be fixed
 * in one pass rather than forty runs.
 */
export function validate(data: unknown): Violation[] {
  const problems: Violation[] = [];
  const add = (path: string, problem: string) => problems.push({ path, problem });

  if (typeof data !== "object" || data === null) {
    return [{ path: "", problem: "the file is not an object" }];
  }

  const file = data as Partial<SeedFile>;
  for (const key of ["accounts", "posts", "replies"] as const) {
    if (!Array.isArray(file[key])) add(key, "missing, or not an array");
  }
  if (problems.length > 0) return problems;

  const accounts = file.accounts!;
  const posts = file.posts!;
  const replies = file.replies!;

  const usernames = new Set<string>();
  accounts.forEach((account, index) => {
    const at = `accounts[${index}]`;
    if (!USERNAME.test(account.username ?? "")) add(`${at}.username`, `not ${RULES.username}`);
    if (usernames.has(account.username)) add(`${at}.username`, `duplicate: ${account.username}`);
    usernames.add(account.username);

    if (!optionalText(account.display_name, 40)) add(`${at}.display_name`, `not ${RULES.displayName}`);
    if (!optionalText(account.bio, 200)) add(`${at}.bio`, `not ${RULES.bio}`);
    if (!isIsoDate(account.created_at)) add(`${at}.created_at`, `not ${RULES.createdAt}`);
  });

  const postIds = new Set<string>();
  posts.forEach((post, index) => {
    const at = `posts[${index}]`;
    if (!post.id) add(`${at}.id`, "missing");
    if (postIds.has(post.id)) add(`${at}.id`, `duplicate: ${post.id}`);
    postIds.add(post.id);

    if (!usernames.has(post.author)) add(`${at}.author`, `no such account: ${post.author}`);
    if (!TOPICS.includes(post.topic as (typeof TOPICS)[number])) add(`${at}.topic`, `unknown: ${post.topic}`);
    if (!KINDS.includes(post.kind as (typeof KINDS)[number])) add(`${at}.kind`, `unknown: ${post.kind}`);

    const titleLength = post.title?.length ?? 0;
    if (titleLength < 8 || titleLength > 140) add(`${at}.title`, `${titleLength} characters, needs ${RULES.title}`);

    const bodyLength = post.body?.length ?? 0;
    if (bodyLength < 1 || bodyLength > 10000) add(`${at}.body`, `${bodyLength} characters, needs ${RULES.body}`);

    if (!Number.isInteger(post.spoiler_level) || post.spoiler_level < 0 || post.spoiler_level > 7) {
      add(`${at}.spoiler_level`, `not ${RULES.spoilerLevel}`);
    }
    if (!isIsoDate(post.created_at)) add(`${at}.created_at`, `not ${RULES.createdAt}`);
    if (!isCount(post.upvotes)) add(`${at}.upvotes`, `not ${RULES.votes}`);
    if (!isCount(post.downvotes)) add(`${at}.downvotes`, `not ${RULES.votes}`);
    if (post.group !== null && typeof post.group !== "string") add(`${at}.group`, "not a slug or null");
  });

  const replyIds = new Set<string>();
  const repliesByPost = new Map<string, Set<string>>();
  replies.forEach((reply, index) => {
    const at = `replies[${index}]`;
    if (!reply.id) add(`${at}.id`, "missing");
    if (replyIds.has(reply.id)) add(`${at}.id`, `duplicate: ${reply.id}`);
    replyIds.add(reply.id);

    if (!postIds.has(reply.post_id)) add(`${at}.post_id`, `no such post: ${reply.post_id}`);
    if (!usernames.has(reply.author)) add(`${at}.author`, `no such account: ${reply.author}`);

    const bodyLength = reply.body?.length ?? 0;
    if (bodyLength < 1 || bodyLength > 10000) add(`${at}.body`, `${bodyLength} characters, needs ${RULES.body}`);

    if (!Number.isInteger(reply.spoiler_level) || reply.spoiler_level < 0 || reply.spoiler_level > 7) {
      add(`${at}.spoiler_level`, `not ${RULES.spoilerLevel}`);
    }
    if (!isIsoDate(reply.created_at)) add(`${at}.created_at`, `not ${RULES.createdAt}`);
    if (!isCount(reply.upvotes)) add(`${at}.upvotes`, `not ${RULES.votes}`);
    if (!isCount(reply.downvotes)) add(`${at}.downvotes`, `not ${RULES.votes}`);

    if (!repliesByPost.has(reply.post_id)) repliesByPost.set(reply.post_id, new Set());
    repliesByPost.get(reply.post_id)!.add(reply.id);
  });

  // An accepted answer has to be a reply on the post that accepted it. Getting
  // this wrong is invisible until somebody opens the thread.
  posts.forEach((post, index) => {
    if (!post.accepted_reply_id) return;
    const at = `posts[${index}].accepted_reply_id`;

    if (!replyIds.has(post.accepted_reply_id)) {
      add(at, `no such reply: ${post.accepted_reply_id}`);
    } else if (!repliesByPost.get(post.id)?.has(post.accepted_reply_id)) {
      add(at, `${post.accepted_reply_id} is a reply on another post`);
    } else if (post.kind !== "question") {
      add(at, "only a question can have an accepted answer");
    }
  });

  return problems;
}

/** The doc written next to the file, so the shape is readable without the code. */
export function renderSchemaDoc(file: SeedFile): string {
  const items = [...file.posts, ...file.replies];
  const maxVotes = Math.max(0, ...items.map((item) => item.upvotes + item.downvotes));
  const groups = [...new Set(file.posts.map((post) => post.group).filter(Boolean))].sort();

  return `# seed.json

Generated by \`pnpm seed:import\`. Do not edit by hand: it is rewritten from the
file on every run, so it always describes what is actually there.

## What is in the file today

| | Count |
| --- | --- |
| Accounts | ${file.accounts.length} |
| Posts | ${file.posts.length} |
| Replies | ${file.replies.length} |
| Posts with an accepted answer | ${file.posts.filter((post) => post.accepted_reply_id).length} |
| Groups referenced | ${groups.length === 0 ? "none" : groups.join(", ")} |
| Vote rows the import will write | ${items.reduce((sum, item) => sum + item.upvotes + item.downvotes, 0)} |
| Most votes on a single item | ${maxVotes} |

That last number sets the size of the synthetic voter pool. One account may vote
once on a given item, so an item with ${maxVotes} votes needs at least ${maxVotes}
voters for the count to come out exact.

## Shape

\`\`\`
{
  "accounts": [
    {
      "username":     string, ${RULES.username}
      "display_name": string or null, ${RULES.displayName}
      "bio":          string or null, ${RULES.bio}
      "created_at":   string, ${RULES.createdAt}
      "persona":      string, documentation only, never imported
    }
  ],
  "posts": [
    {
      "id":                string, unique within the file, referenced by replies
      "author":            string, must match an account username
      "group":             string slug or null
      "topic":             one of ${TOPICS.join(", ")}
      "kind":              one of ${KINDS.join(", ")}
      "title":             string, ${RULES.title}
      "body":              string, ${RULES.body}
      "spoiler_level":     ${RULES.spoilerLevel}
      "created_at":        string, ${RULES.createdAt}
      "upvotes":           ${RULES.votes}
      "downvotes":         ${RULES.votes}
      "accepted_reply_id": string or null, must be a reply on this post
    }
  ],
  "replies": [
    {
      "id":            string, unique within the file
      "post_id":       string, must match a post id
      "author":        string, must match an account username
      "body":          string, ${RULES.body}
      "spoiler_level": ${RULES.spoilerLevel}
      "created_at":    string, ${RULES.createdAt}
      "upvotes":       ${RULES.votes}
      "downvotes":     ${RULES.votes}
    }
  ]
}
\`\`\`

## What the importer checks before it writes anything

Every rule above, plus:

- No duplicate usernames, post ids, or reply ids.
- Every \`author\` names an account in the same file.
- Every \`post_id\` names a post in the same file.
- Every \`accepted_reply_id\` names a reply **on that post**, and only a question
  may have one.

A violation stops the run before the first write, and every violation is printed,
not just the first. Fixing forty problems should take one pass.

## What is not imported

\`persona\` is documentation. It describes the voice behind an account for whoever
writes the next batch of content, and no column holds it. See
[seed-personas.md](../../docs/app/seed-personas.md).
`;
}
