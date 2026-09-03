import { createSupabaseServerClient } from "../supabase/server";
import { applySpoilerGateAll, type Gated } from "../spoilers";
import type { PostAuthor } from "./posts";

const REPLY_COLUMNS = `
  id, post_id, author_id, body, spoiler_level, vote_count, is_hidden, created_at,
  author:profiles!replies_author_id_fkey(username, display_name, avatar_path)
`;

export type ReplyRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  spoiler_level: number;
  vote_count: number;
  is_hidden: boolean;
  created_at: string;
  author: PostAuthor;
};

export type GatedReply = Gated<ReplyRow>;

function normalize(row: Record<string, unknown>): ReplyRow {
  const author = Array.isArray(row.author) ? row.author[0] : row.author;
  return { ...row, author } as ReplyRow;
}

/** Accepted answer first, then most voted, then oldest. Each reply is gated on its own level. */
export async function listReplies(
  postId: string,
  viewerProgress: number,
  acceptedReplyId: string | null,
): Promise<GatedReply[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("replies")
    .select(REPLY_COLUMNS)
    .eq("post_id", postId)
    .eq("is_hidden", false)
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const rows = (data as Record<string, unknown>[]).map(normalize);
  rows.sort((a, b) => Number(b.id === acceptedReplyId) - Number(a.id === acceptedReplyId));

  return applySpoilerGateAll(rows, viewerProgress);
}

export async function listRepliesByAuthor(authorId: string, viewerProgress: number): Promise<GatedReply[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("replies")
    // No parent post embed. applySpoilerGate only strips a reply's own title and
    // body, so an embedded post title would ride along inside a gated reply and
    // put a level 7 headline in the payload of something the reader cannot see.
    .select(REPLY_COLUMNS)
    .eq("author_id", authorId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return applySpoilerGateAll((data as Record<string, unknown>[]).map(normalize), viewerProgress);
}

export async function getReplyRaw(replyId: string): Promise<ReplyRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("replies").select(REPLY_COLUMNS).eq("id", replyId).maybeSingle();

  if (error || !data) return null;
  return normalize(data as Record<string, unknown>);
}
