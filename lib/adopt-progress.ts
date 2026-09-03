import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAnonymousProgress, readAnonymousProgress } from "./anonymous-progress";

/**
 * Carries a guest's cookie level onto the profile the signup trigger just created,
 * then drops the cookie so the profile is the single source of truth from here on.
 * Returns the level that was adopted, or null when there was nothing to carry.
 */
export async function adoptAnonymousProgress(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const level = await readAnonymousProgress();
  if (level === null) return null;

  const { error } = await supabase.from("profiles").update({ progress: level }).eq("id", userId);
  if (error) return null;

  await clearAnonymousProgress();
  return level;
}
