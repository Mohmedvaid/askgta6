import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAnonymousShield, readAnonymousProgress, readAnonymousShield } from "./anonymous-progress";

/**
 * Carries a guest's shield onto the profile the signup trigger just created, then
 * drops the cookies so the profile is the single source of truth from here on.
 * Returns what was adopted, or null when the guest never touched the control.
 */
export async function adoptAnonymousShield(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ enabled: boolean; progress: number } | null> {
  const level = await readAnonymousProgress();
  const enabled = await readAnonymousShield();

  // Nothing to carry: the shield is off at the shipped default and no level was set.
  if (level === null && !enabled) return null;

  const adopted = { enabled, progress: level ?? 0 };
  const { error } = await supabase
    .from("profiles")
    .update({ progress: adopted.progress, spoiler_shield: adopted.enabled })
    .eq("id", userId);
  if (error) return null;

  await clearAnonymousShield();
  return adopted;
}
