"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { firstIssue, profileSchema, progressSchema, themeSchema, type ActionResult } from "@/lib/validation";
import { THEME_COOKIE } from "@/lib/theme/cookie";

export async function saveProfile(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to edit your profile." };

  const parsed = profileSchema.safeParse({
    username: String(formData.get("username") ?? ""),
    displayName: formData.get("displayName") ? String(formData.get("displayName")) : undefined,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ username: parsed.data.username, display_name: parsed.data.displayName ?? null })
    .eq("id", viewer.userId);

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "That username is taken." : "Your profile could not be saved.",
    };
  }

  revalidatePath("/settings");
  revalidatePath(`/u/${parsed.data.username}`);
  return { ok: true, data: undefined };
}

export async function setProgress(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to set your progress." };

  const parsed = progressSchema.safeParse({ progress: String(formData.get("progress") ?? "0") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_progress", { new_level: parsed.data.progress });
  if (error) return { ok: false, error: "Your progress could not be saved." };

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
