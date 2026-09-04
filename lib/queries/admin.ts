import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * Every read the admin dashboard makes, through the service role key.
 *
 * These bypass row level security on purpose: a moderator has to see hidden posts,
 * private group content, and reports filed against people. The gate is
 * requireAdmin() in the page and in every action, never the client.
 */

export type DailyCount = { day: string; signups: number; posts: number; replies: number };

export type Totals = {
  profiles: number;
  posts: number;
  replies: number;
  groups: number;
  banned: number;
  hidden_posts: number;
  hidden_replies: number;
  reported_items: number;
};

export async function getDailyCounts(): Promise<DailyCount[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("admin_daily_counts").select("*").order("day", { ascending: true });
  return (data ?? []) as DailyCount[];
}

export async function getTotals(): Promise<Totals> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("admin_totals").select("*").maybeSingle();
  return (data ?? {
    profiles: 0,
    posts: 0,
    replies: 0,
    groups: 0,
    banned: 0,
    hidden_posts: 0,
    hidden_replies: 0,
    reported_items: 0,
  }) as Totals;
}

export type ReportedItem = {
  targetType: "post" | "reply";
  targetId: string;
  title: string;
  excerpt: string;
  authorId: string | null;
  authorUsername: string | null;
  isHidden: boolean;
  reasons: string[];
  reporterCount: number;
  notes: string[];
};

type ReportRow = {
  target_type: "post" | "reply";
  target_id: string;
  reason: string;
  note: string | null;
  reporter_id: string;
};

/**
 * The queue, grouped by the thing reported rather than by report, because a
 * moderator acts on an item once however many people flagged it.
 *
 * Auto hidden items come first. Five distinct reporters hides something
 * automatically, so anything already hidden is what the trigger judged worst.
 */
export async function listReportedItems(): Promise<ReportedItem[]> {
  const admin = createSupabaseAdminClient();

  const { data: reports } = await admin
    .from("reports")
    .select("target_type, target_id, reason, note, reporter_id")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (reports ?? []) as ReportRow[];
  if (rows.length === 0) return [];

  const postIds = rows.filter((r) => r.target_type === "post").map((r) => r.target_id);
  const replyIds = rows.filter((r) => r.target_type === "reply").map((r) => r.target_id);

  const [posts, replies] = await Promise.all([
    postIds.length
      ? admin
          .from("posts")
          .select("id, title, body, is_hidden, author_id, author:profiles!posts_author_id_fkey(username)")
          .in("id", postIds)
      : Promise.resolve({ data: [] }),
    replyIds.length
      ? admin
          .from("replies")
          .select("id, body, is_hidden, author_id, author:profiles!replies_author_id_fkey(username)")
          .in("id", replyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const embedded = (value: unknown) => (Array.isArray(value) ? value[0] : value) as { username?: string } | null;

  const targets = new Map<string, { title: string; excerpt: string; hidden: boolean; authorId: string | null; username: string | null }>();

  for (const row of (posts.data ?? []) as Record<string, unknown>[]) {
    targets.set(`post:${row.id}`, {
      title: String(row.title ?? ""),
      excerpt: String(row.body ?? "").slice(0, 240),
      hidden: row.is_hidden === true,
      authorId: (row.author_id as string) ?? null,
      username: embedded(row.author)?.username ?? null,
    });
  }
  for (const row of (replies.data ?? []) as Record<string, unknown>[]) {
    targets.set(`reply:${row.id}`, {
      title: "Reply",
      excerpt: String(row.body ?? "").slice(0, 240),
      hidden: row.is_hidden === true,
      authorId: (row.author_id as string) ?? null,
      username: embedded(row.author)?.username ?? null,
    });
  }

  const grouped = new Map<string, ReportedItem & { reporters: Set<string> }>();

  for (const row of rows) {
    const key = `${row.target_type}:${row.target_id}`;
    const target = targets.get(key);
    const existing = grouped.get(key);

    if (existing) {
      existing.reporters.add(row.reporter_id);
      if (!existing.reasons.includes(row.reason)) existing.reasons.push(row.reason);
      if (row.note) existing.notes.push(row.note);
      continue;
    }

    grouped.set(key, {
      targetType: row.target_type,
      targetId: row.target_id,
      title: target?.title ?? "Deleted",
      excerpt: target?.excerpt ?? "This item is already gone.",
      authorId: target?.authorId ?? null,
      authorUsername: target?.username ?? null,
      isHidden: target?.hidden ?? false,
      reasons: [row.reason],
      reporterCount: 0,
      notes: row.note ? [row.note] : [],
      reporters: new Set([row.reporter_id]),
    });
  }

  return [...grouped.values()]
    .map(({ reporters, ...item }) => ({ ...item, reporterCount: reporters.size }))
    .sort((a, b) => {
      // Auto hidden first, then by how many distinct people complained.
      if (a.isHidden !== b.isHidden) return a.isHidden ? -1 : 1;
      return b.reporterCount - a.reporterCount;
    });
}

export type AdminUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  isAdmin: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  postCount: number;
  reportsAgainst: number;
};

/**
 * Search by username or email. Email lives in auth.users, which PostgREST does not
 * expose, so an email search resolves through the auth admin API first and then
 * reads the profile.
 */
export async function findUsers(query: string): Promise<AdminUser[]> {
  const admin = createSupabaseAdminClient();
  const term = query.trim();

  let ids: string[] | null = null;
  if (term.includes("@")) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    ids = (data?.users ?? [])
      .filter((user) => (user.email ?? "").toLowerCase().includes(term.toLowerCase()))
      .map((user) => user.id);
    if (ids.length === 0) return [];
  }

  let builder = admin
    .from("profiles")
    .select("id, username, display_name, created_at, is_admin, banned_at, banned_reason")
    .order("created_at", { ascending: false })
    .limit(50);

  if (ids) builder = builder.in("id", ids);
  else if (term) builder = builder.ilike("username", `%${term}%`);

  const { data } = await builder;
  const profiles = (data ?? []) as Record<string, unknown>[];
  if (profiles.length === 0) return [];

  const profileIds = profiles.map((p) => String(p.id));

  const [{ data: authUsers }, { data: posts }, { data: reports }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("posts").select("author_id").in("author_id", profileIds),
    admin.from("reports").select("target_id, target_type"),
  ]);

  const emails = new Map((authUsers?.users ?? []).map((user) => [user.id, user.email ?? null]));

  const postCounts = new Map<string, number>();
  for (const row of (posts ?? []) as { author_id: string }[]) {
    postCounts.set(row.author_id, (postCounts.get(row.author_id) ?? 0) + 1);
  }

  // Reports name a post or a reply, not a person, so they are attributed through
  // authorship. One extra read, and it is the number a moderator actually wants.
  const reportedPostIds = ((reports ?? []) as { target_id: string; target_type: string }[])
    .filter((r) => r.target_type === "post")
    .map((r) => r.target_id);

  const authorOfReported = new Map<string, number>();
  if (reportedPostIds.length > 0) {
    const { data: reportedPosts } = await admin.from("posts").select("author_id").in("id", reportedPostIds);
    for (const row of (reportedPosts ?? []) as { author_id: string }[]) {
      authorOfReported.set(row.author_id, (authorOfReported.get(row.author_id) ?? 0) + 1);
    }
  }

  return profiles.map((profile) => {
    const id = String(profile.id);
    return {
      id,
      username: String(profile.username ?? ""),
      displayName: (profile.display_name as string) ?? null,
      email: emails.get(id) ?? null,
      createdAt: String(profile.created_at ?? ""),
      isAdmin: profile.is_admin === true,
      bannedAt: (profile.banned_at as string) ?? null,
      bannedReason: (profile.banned_reason as string) ?? null,
      postCount: postCounts.get(id) ?? 0,
      reportsAgainst: authorOfReported.get(id) ?? 0,
    };
  });
}

export type AdminPost = {
  id: string;
  title: string;
  isHidden: boolean;
  createdAt: string;
  authorUsername: string | null;
};

export async function listRecentPosts(): Promise<AdminPost[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("posts")
    .select("id, title, is_hidden, created_at, author:profiles!posts_author_id_fkey(username)")
    .order("created_at", { ascending: false })
    .limit(50);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const author = (Array.isArray(row.author) ? row.author[0] : row.author) as { username?: string } | null;
    return {
      id: String(row.id),
      title: String(row.title ?? ""),
      isHidden: row.is_hidden === true,
      createdAt: String(row.created_at ?? ""),
      authorUsername: author?.username ?? null,
    };
  });
}

export type AdminGroup = {
  id: string;
  slug: string;
  name: string;
  visibility: "public" | "private";
  memberCount: number;
  createdAt: string;
};

export async function listRecentGroups(): Promise<AdminGroup[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("groups")
    .select("id, slug, name, visibility, member_count, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    visibility: row.visibility === "private" ? "private" : "public",
    memberCount: Number(row.member_count ?? 0),
    createdAt: String(row.created_at ?? ""),
  }));
}
