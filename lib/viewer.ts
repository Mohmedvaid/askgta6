import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import { clampProgress, type SpoilerLevel } from "./spoilers";
import { readAnonymousProgress } from "./anonymous-progress";

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

/**
 * The one place progress is read. A signed in reader's level comes from their
 * profile, a logged out one's from the cookie, and an unanswered visitor reads
 * at 0. Every gated query calls this, so the two paths can never drift.
 */
export const getViewerProgress = cache(async (): Promise<SpoilerLevel> => {
  const viewer = await getViewer();
  if (viewer) return viewer.progress;
  return (await readAnonymousProgress()) ?? 0;
});

/** True when a logged out visitor has never been asked, which is what shows the sheet. */
export async function needsProgressPrompt(): Promise<boolean> {
  if (await getViewer()) return false;
  return (await readAnonymousProgress()) === null;
}
