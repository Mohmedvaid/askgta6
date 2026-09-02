import { createSupabaseServerClient } from "../supabase/server";

export type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  progress: number;
  created_at: string;
};

export async function getProfileByUsername(username: string): Promise<ProfileRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_path, progress, created_at")
    .eq("username", username)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/** Public URL for an avatar path in the avatars bucket, or null for the fallback mark. */
export async function avatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const supabase = await createSupabaseServerClient();
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
