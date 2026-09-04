import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import { NO_GATING, SPOILER_SHIELD_DEFAULT, clampProgress, type SpoilerLevel, type ViewerProgress } from "./spoilers";
import { readAnonymousProgress, readAnonymousShield } from "./anonymous-progress";

export type Viewer = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  progress: SpoilerLevel;
  shieldEnabled: boolean;
  theme: "dark" | "light";
  isAdmin: boolean;
  bannedAt: string | null;
};

/** The signed in person, or null. Cached per request so a page can ask more than once. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_path, progress, spoiler_shield, theme, is_admin, banned_at")
    .eq("id", auth.user.id)
    .single();

  if (!profile) return null;

  return {
    userId: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
    progress: clampProgress(profile.progress),
    shieldEnabled: profile.spoiler_shield === true,
    theme: profile.theme === "light" ? "light" : "dark",
    // Admin and ban both live on the row so row level security can read them.
    // What is here is for rendering; the database enforces both independently.
    isAdmin: profile.is_admin === true,
    bannedAt: profile.banned_at ?? null,
  };
});

/** Whether the shield is on and what level it is set to, for either kind of reader. */
export type ShieldState = { enabled: boolean; progress: SpoilerLevel };

export const getShieldState = cache(async (): Promise<ShieldState> => {
  const viewer = await getViewer();
  if (viewer) return { enabled: viewer.shieldEnabled, progress: viewer.progress };

  return {
    enabled: await readAnonymousShield(),
    progress: (await readAnonymousProgress()) ?? 0,
  };
});

/**
 * The one place gating is decided. A reader with the shield off gets NO_GATING,
 * which means every post and reply comes back in full. Every gated query calls
 * this, so the signed in and logged out paths cannot drift.
 */
export const getViewerProgress = cache(async (): Promise<ViewerProgress> => {
  const shield = await getShieldState();
  return shield.enabled ? shield.progress : NO_GATING;
});

export { SPOILER_SHIELD_DEFAULT };
