import { createSupabaseServerClient } from "../supabase/server";
import { applySpoilerGate, applySpoilerGateAll, type Gated, type ViewerProgress } from "../spoilers";
import { decodeCursor, encodeCursor } from "../cursor";
import type { PostKind, Topic } from "../topics";

export const PAGE_SIZE = 20;

const POST_COLUMNS = `
  id, author_id, group_id, topic, kind, title, body, spoiler_level,
  vote_count, reply_count, accepted_reply_id, is_hidden, created_at,
  author:profiles!posts_author_id_fkey(username, display_name, avatar_path),
  group:groups(slug, name, visibility)
`;

export type PostAuthor = { username: string; display_name: string | null; avatar_path: string | null };

export type PostRow = {
  id: string;
  author_id: string;
  group_id: string | null;
  topic: Topic;
  kind: PostKind;
  title: string;
  body: string;
  spoiler_level: number;
  vote_count: number;
  reply_count: number;
  accepted_reply_id: string | null;
  is_hidden: boolean;
  created_at: string;
  author: PostAuthor;
  group: { slug: string; name: string; visibility: "public" | "private" } | null;
};

export type GatedPost = Gated<PostRow>;

export type FeedTab = "latest" | "top" | "unanswered";

export type FeedQuery = {
  tab?: FeedTab;
  topic?: Topic | null;
  groupId?: string;
  authorId?: string | null;
  cursor?: string | null;
  search?: string | null;
  page?: number;
};

export type FeedPage = {
  items: GatedPost[];
  nextCursor: string | null;
  nextPage: number | null;
};

/** Supabase returns embedded rows as arrays or objects depending on the relationship. */
function normalize(row: Record<string, unknown>): PostRow {
  const author = Array.isArray(row.author) ? row.author[0] : row.author;
  const group = Array.isArray(row.group) ? row.group[0] : row.group;
  return { ...row, author, group } as PostRow;
}

/**
 * The single read path for lists of posts. Every caller gets gated rows back,
 * so a hidden post never carries a title or a body out of this module.
 */
export async function listPosts(query: FeedQuery, viewerProgress: ViewerProgress): Promise<FeedPage> {
  const supabase = await createSupabaseServerClient();
  const tab = query.tab ?? "latest";

  if (query.search) {
    const page = Math.max(query.page ?? 0, 0);
    const { data, error } = await supabase
      .rpc("search_posts", { p_query: query.search, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE })
      .select(POST_COLUMNS);

    if (error || !data) return { items: [], nextCursor: null, nextPage: null };
    const rows = (data as Record<string, unknown>[]).map(normalize);
    return {
      items: applySpoilerGateAll(rows, viewerProgress),
      nextCursor: null,
      nextPage: rows.length === PAGE_SIZE ? page + 1 : null,
    };
  }

  let builder = supabase.from("posts").select(POST_COLUMNS).eq("is_hidden", false).limit(PAGE_SIZE);

  if (query.groupId) builder = builder.eq("group_id", query.groupId);

  if (query.topic) builder = builder.eq("topic", query.topic);
  if (query.authorId) builder = builder.eq("author_id", query.authorId);

  if (tab === "unanswered") {
    builder = builder.eq("kind", "question").is("accepted_reply_id", null);
  }

  if (tab === "top") {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const page = Math.max(query.page ?? 0, 0);
    builder = builder
      .gte("created_at", since)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    const { data, error } = await builder;
    if (error || !data) return { items: [], nextCursor: null, nextPage: null };
    const rows = (data as Record<string, unknown>[]).map(normalize);
    return {
      items: applySpoilerGateAll(rows, viewerProgress),
      nextCursor: null,
      nextPage: rows.length === PAGE_SIZE ? page + 1 : null,
    };
  }

  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    builder = builder.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await builder
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return { items: [], nextCursor: null, nextPage: null };

  const rows = (data as Record<string, unknown>[]).map(normalize);
  const last = rows[rows.length - 1];

  return {
    items: applySpoilerGateAll(rows, viewerProgress),
    nextCursor: rows.length === PAGE_SIZE && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
    nextPage: null,
  };
}

/** One post, gated. Returns null when the viewer may not see the row at all. */
export async function getPost(postId: string, viewerProgress: ViewerProgress): Promise<GatedPost | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("posts").select(POST_COLUMNS).eq("id", postId).maybeSingle();

  if (error || !data) return null;
  return applySpoilerGate(normalize(data as Record<string, unknown>), viewerProgress);
}

/** Ungated read for the author's own edit form and for reveal, both of which check ownership. */
export async function getPostRaw(postId: string): Promise<PostRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("posts").select(POST_COLUMNS).eq("id", postId).maybeSingle();

  if (error || !data) return null;
  return normalize(data as Record<string, unknown>);
}

export const SYNDICATION_LIMIT = 50;

export type SyndicatedPost = { id: string; title: string; author: string; createdAt: string };

/**
 * The rows an RSS feed carries: level 0 only, never hidden, never inside a private
 * group. No body is selected, so there is nothing for the gate to hold back and
 * nothing a feed reader could leak. Level 0 is the whole rule: a feed reader has
 * no shield, so anything above trailer level has no business being pushed to one.
 */
export async function listSyndicatedPosts(groupId?: string): Promise<SyndicatedPost[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("posts")
    .select("id, title, created_at, author:profiles!posts_author_id_fkey(username, display_name), group:groups(visibility)")
    .eq("is_hidden", false)
    .eq("spoiler_level", 0)
    .order("created_at", { ascending: false })
    .limit(SYNDICATION_LIMIT);

  query = groupId ? query.eq("group_id", groupId) : query.is("group_id", null);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Record<string, unknown>[])
    .map((row) => {
      const author = Array.isArray(row.author) ? row.author[0] : row.author;
      const group = Array.isArray(row.group) ? row.group[0] : row.group;
      return { ...row, author, group } as {
        id: string;
        title: string;
        created_at: string;
        author: { username: string; display_name: string | null } | null;
        group: { visibility: "public" | "private" } | null;
      };
    })
    .filter((row) => !row.group || row.group.visibility === "public")
    .map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author?.display_name || row.author?.username || "Someone",
      createdAt: row.created_at,
    }));
}
