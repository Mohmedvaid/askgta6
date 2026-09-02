import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import { clampProgress, type SpoilerLevel } from "./spoilers";

export type Viewer = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  progress: SpoilerLevel;
  theme: "dark" | "light";
};

/**
 * The signed in person, or null. Cached per request so a page can ask more than once.
 * Logged out visitors read at progress 0, which is the whole point before launch.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_path, progress, theme")
    .eq("id", auth.user.id)
    .single();

  if (!profile) return null;

  return {
    userId: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
    progress: clampProgress(profile.progress),
    theme: profile.theme === "light" ? "light" : "dark",
  };
});

export async function getViewerProgress(): Promise<SpoilerLevel> {
  const viewer = await getViewer();
  return viewer?.progress ?? 0;
}
