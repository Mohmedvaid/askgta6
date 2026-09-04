"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, profileSchema, shieldSchema, themeSchema, type ActionResult } from "@/lib/validation";
import { THEME_COOKIE } from "@/lib/theme/cookie";
import { writeAnonymousShield } from "@/lib/anonymous-progress";
import { clampProgress } from "@/lib/spoilers";
import { usernameCooldownEndsAt, usernameCooldownError } from "@/lib/profile-rules";
import { isPlaceholderUsername } from "@/lib/username";

/**
 * Username, display name, and bio. **Never email.**
 *
 * There is no email field on the form and none is read here, so nothing this action
 * writes can reach auth.users. Changing the address on an account is how a stolen
 * session becomes a stolen account, and there is no self service path to it: an
 * account recovers through the password reset flow, which needs the original inbox.
 * tests/unit/profile-email.test.ts asserts no action anywhere calls updateUser with
 * an email.
 */
export async function saveProfile(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to edit your profile." };

  const parsed = profileSchema.safeParse({
    username: String(formData.get("username") ?? ""),
    displayName: formData.get("displayName") ? String(formData.get("displayName")) : undefined,
    bio: formData.get("bio") ? String(formData.get("bio")) : undefined,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const changingName = parsed.data.username !== viewer.username;

  // The generated player_xxxxxx name is not a choice anybody made, so the first
  // change away from it does not spend the cooldown. The database trigger agrees.
  if (changingName && !isPlaceholderUsername(viewer.username)) {
    const endsAt = usernameCooldownEndsAt(viewer.usernameChangedAt);
    if (endsAt) return { ok: false, error: usernameCooldownError(endsAt) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      username: parsed.data.username,
      display_name: parsed.data.displayName ?? null,
      bio: parsed.data.bio ?? null,
    })
    .eq("id", viewer.userId);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "That username is taken." };
    // The trigger raises this when the action's own check was bypassed.
    if (error.message.includes("username changed too recently")) {
      return { ok: false, error: usernameCooldownError(new Date(Date.now() + 24 * 60 * 60 * 1000)) };
    }
    return { ok: false, error: "Your profile could not be saved." };
  }

  revalidatePath("/settings");
  revalidatePath(`/u/${viewer.username}`);
  revalidatePath(`/u/${parsed.data.username}`);
  return { ok: true, data: undefined };
}

/**
 * The one write path for the shield, for either kind of reader. A guest gets two
 * cookies, a signed in reader gets two columns. Profiles row level security already
 * limits the update to its owner and the check constraint already bounds the level,
 * so this writes the row directly rather than going through set_progress.
 */
export async function setSpoilerShield(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = shieldSchema.safeParse({
    enabled: formData.get("enabled") === "true",
    progress: String(formData.get("progress") ?? "0"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const level = clampProgress(parsed.data.progress);
  const viewer = await getViewer();

  if (!viewer) {
    await writeAnonymousShield(parsed.data.enabled, level);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ progress: level, spoiler_shield: parsed.data.enabled })
    .eq("id", viewer.userId);

  if (error) return { ok: false, error: "Your spoiler shield could not be saved." };

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function setTheme(formData: FormData): Promise<void> {
  const parsed = themeSchema.safeParse({ theme: String(formData.get("theme") ?? "dark") });
  if (!parsed.success) return;

  const store = await cookies();
  store.set(THEME_COOKIE, parsed.data.theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const viewer = await getViewer();
  if (viewer) {
    const supabase = await createSupabaseServerClient();
    await supabase.from("profiles").update({ theme: parsed.data.theme }).eq("id", viewer.userId);
  }

  revalidatePath("/", "layout");
}

export async function uploadAvatar(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to change your avatar." };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image first." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "Avatars are capped at 2 MB." };
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
    return { ok: false, error: "Use a PNG, JPEG, WebP, or GIF image." };
  }

  const extension = file.type.split("/")[1] ?? "png";
  const path = `${viewer.userId}/avatar.${extension}`;

  const supabase = await createSupabaseServerClient();
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { ok: false, error: "That image could not be uploaded." };

  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", viewer.userId);
  if (error) return { ok: false, error: "That image was uploaded but not saved to your profile." };

  revalidatePath("/settings");
  return { ok: true, data: undefined };
}
