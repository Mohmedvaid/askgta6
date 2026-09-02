import { createSupabaseServerClient } from "../supabase/server";

export type GroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  owner_id: string;
  member_count: number;
  created_at: string;
};

const GROUP_COLUMNS = "id, slug, name, description, visibility, owner_id, member_count, created_at";

export async function getGroupBySlug(slug: string): Promise<GroupRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("groups").select(GROUP_COLUMNS).eq("slug", slug).maybeSingle();
  return (data as GroupRow | null) ?? null;
}

export async function listDiscoverableGroups(limit = 24): Promise<GroupRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("visibility", "public")
    .order("member_count", { ascending: false })
    .limit(limit);
  return (data as GroupRow[] | null) ?? [];
}

export async function listMyGroups(userId: string): Promise<GroupRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("group_members")
    .select(`group:groups(${GROUP_COLUMNS})`)
    .eq("user_id", userId);

  if (!data) return [];
  return data
    .map((row) => (Array.isArray(row.group) ? row.group[0] : row.group))
    .filter((group): group is GroupRow => Boolean(group))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function isMember(groupId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function listInvites(groupId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("group_invites")
    .select("id, code, expires_at, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(5);
  return data ?? [];
}
