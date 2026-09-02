"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { generateInviteCode, slugify } from "@/lib/slug";
import { firstIssue, groupInputSchema, inviteCodeSchema, type ActionResult } from "@/lib/validation";

export async function createGroup(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to create a group." };

  const parsed = groupInputSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: formData.get("description") ? String(formData.get("description")) : undefined,
    visibility: String(formData.get("visibility") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const base = slugify(parsed.data.name);
  if (!base) return { ok: false, error: "Pick a name with at least one letter or digit." };

  const supabase = await createSupabaseServerClient();
  let slug = base;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("groups")
      .insert({
        slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        visibility: parsed.data.visibility,
        owner_id: viewer.userId,
      })
      .select("slug")
      .single();

    if (data) {
      revalidatePath("/g");
      redirect(`/g/${data.slug}`);
    }
    if (error?.code !== "23505") return { ok: false, error: "That group could not be created." };
    slug = `${base}-${generateInviteCode().slice(0, 4).toLowerCase()}`;
  }

  return { ok: false, error: "That name is taken. Try another one." };
}

export async function joinGroup(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const groupId = String(formData.get("groupId") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const supabase = await createSupabaseServerClient();
  await supabase.from("group_members").insert({ group_id: groupId, user_id: viewer.userId, role: "member" });

  revalidatePath(`/g/${slug}`);
}

export async function leaveGroup(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const groupId = String(formData.get("groupId") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const supabase = await createSupabaseServerClient();
  await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", viewer.userId);

  revalidatePath(`/g/${slug}`);
}

export async function createInvite(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const groupId = String(formData.get("groupId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createSupabaseServerClient();
  await supabase.from("group_invites").insert({
    group_id: groupId,
    code: generateInviteCode(),
    created_by: viewer.userId,
    expires_at: expiresAt,
  });

  revalidatePath(`/g/${slug}`);
}

export async function redeemInvite(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to join a group." };

  const parsed = inviteCodeSchema.safeParse({ code: String(formData.get("code") ?? "") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("join_group_by_invite", { p_code: parsed.data.code });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message.includes("expired") ? "That invite code has expired." : "That invite code is not valid.",
    };
  }

  revalidatePath(`/g/${data}`);
  redirect(`/g/${data}`);
}
