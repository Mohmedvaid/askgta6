"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAdminAction, requireAdmin } from "@/lib/admin";
import {
  adminProfileSchema,
  banSchema,
  blockListSchema,
  deleteAccountSchema,
  firstIssue,
  moderationSchema,
  type ActionResult,
} from "@/lib/validation";
import { hostOf } from "@/lib/links";

const REFUSED = "That action is not available to you.";

function refreshAdmin(): void {
  for (const path of ["/admin", "/admin/reports", "/admin/users", "/admin/content"]) revalidatePath(path);
}

/**
 * Hide, unhide, delete, or dismiss a reported item.
 *
 * "Dismiss" clears the reports and leaves the content alone, which is the answer
 * for a brigade. It is the only one of the four that touches the reports table.
 *
 * Every branch re-checks is_admin here rather than trusting the page that rendered
 * the button, because a server action is its own entry point.
 */
export async function moderate(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!viewer) return { ok: false, error: REFUSED };

  const parsed = moderationSchema.safeParse({
    targetType: String(formData.get("targetType") ?? ""),
    targetId: String(formData.get("targetId") ?? ""),
    action: String(formData.get("action") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { targetType, targetId, action } = parsed.data;
  const admin = createSupabaseAdminClient();
  const table = targetType === "post" ? "posts" : "replies";

  if (action === "dismiss") {
    const { error } = await admin.from("reports").delete().eq("target_type", targetType).eq("target_id", targetId);
    if (error) return { ok: false, error: "Those reports could not be cleared." };
  } else if (action === "delete") {
    const { error } = await admin.from(table).delete().eq("id", targetId);
    if (error) return { ok: false, error: "That item could not be deleted." };
  } else {
    const { error } = await admin.rpc("set_hidden", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_hidden: action === "hide",
    });
    if (error) return { ok: false, error: "That item could not be updated." };
  }

  await recordAdminAction(viewer.userId, action, targetType, targetId);
  refreshAdmin();
  if (targetType === "post") revalidatePath(`/p/${targetId}`);
  return { ok: true, data: undefined };
}

/**
 * Ban or unban an account.
 *
 * The columns this writes are what `public.is_banned()` reads, and that function is
 * inside the insert policies for posts, replies, groups, and reports, and inside
 * cast_vote. So this is not a UI state: a banned session is refused by Postgres
 * whatever it sends.
 */
export async function setBanned(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!viewer) return { ok: false, error: REFUSED };

  const parsed = banSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    action: String(formData.get("action") ?? ""),
    reason: formData.get("reason") ? String(formData.get("reason")) : undefined,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { userId, action, reason } = parsed.data;
  if (userId === viewer.userId) return { ok: false, error: "You cannot ban yourself." };

  const admin = createSupabaseAdminClient();

  // An admin banning another admin is almost always a mistake or a compromise.
  const { data: target } = await admin.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (action === "ban" && (target as { is_admin?: boolean } | null)?.is_admin) {
    return { ok: false, error: "Take the admin flag off that account first." };
  }

  const { error } = await admin
    .from("profiles")
    .update(
      action === "ban"
        ? { banned_at: new Date().toISOString(), banned_reason: reason ?? null }
        : { banned_at: null, banned_reason: null },
    )
    .eq("id", userId);

  if (error) return { ok: false, error: "That account could not be updated." };

  await recordAdminAction(viewer.userId, action, "user", userId, reason ? { reason } : {});
  refreshAdmin();
  return { ok: true, data: undefined };
}

/**
 * Delete an account outright.
 *
 * Deleting the auth user cascades through every foreign key that points at it, so
 * posts, replies, votes, and reports go with it. There is no undo, which is why the
 * form makes you type the username and why the audit row is written before the
 * delete rather than after: once the row is gone there is nothing left to name.
 */
export async function deleteAccount(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!viewer) return { ok: false, error: REFUSED };

  const parsed = deleteAccountSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { userId, confirm } = parsed.data;
  if (userId === viewer.userId) return { ok: false, error: "You cannot delete your own account here." };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from("profiles").select("username, is_admin").eq("id", userId).maybeSingle();
  const target = profile as { username?: string; is_admin?: boolean } | null;

  if (!target) return { ok: false, error: "That account is already gone." };
  if (target.is_admin) return { ok: false, error: "Take the admin flag off that account first." };
  if (confirm !== target.username) return { ok: false, error: "That username does not match." };

  await recordAdminAction(viewer.userId, "delete_account", "user", userId, { username: target.username });

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: "That account could not be deleted." };

  refreshAdmin();
  return { ok: true, data: undefined };
}

/**
 * Add to or remove from the blocked domain and phrase lists.
 *
 * A domain is stored as a bare hostname, so pasting a whole URL still works and
 * "https://bit.ly/abc" becomes "bit.ly". A phrase is stored lowercase because
 * lib/spam.ts matches it against a lowercased body.
 */
export async function editBlockList(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!viewer) return { ok: false, error: REFUSED };

  const parsed = blockListSchema.safeParse({
    list: String(formData.get("list") ?? ""),
    action: String(formData.get("action") ?? ""),
    value: String(formData.get("value") ?? ""),
    note: formData.get("note") ? String(formData.get("note")) : undefined,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { list, action, value, note } = parsed.data;
  const table = list === "domain" ? "blocked_domains" : "blocked_phrases";
  const column = list === "domain" ? "domain" : "phrase";
  const stored = list === "domain" ? (hostOf(value) ?? value) : value;

  const admin = createSupabaseAdminClient();

  if (action === "remove") {
    const { error } = await admin.from(table).delete().eq(column, stored);
    if (error) return { ok: false, error: "That entry could not be removed." };
    await recordAdminAction(viewer.userId, "block_remove", list, null, { value: stored });
  } else {
    const { error } = await admin.from(table).insert({ [column]: stored, note: note ?? null });
    if (error) {
      return { ok: false, error: error.code === "23505" ? "That is already on the list." : "That entry could not be added." };
    }
    await recordAdminAction(viewer.userId, "block_add", list, null, { value: stored, note: note ?? null });
  }

  refreshAdmin();
  return { ok: true, data: undefined };
}

/**
 * Rename an account, or clear its bio.
 *
 * Both exist because a username and a bio are public surfaces somebody can put
 * something vile on, and waiting for the owner to fix it is not a plan. The
 * database trigger exempts an admin from the thirty day cooldown, so this is not
 * blocked by a rename the owner made yesterday.
 */
export async function adminEditProfile(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!viewer) return { ok: false, error: REFUSED };

  const parsed = adminProfileSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    username: formData.get("username") ? String(formData.get("username")) : undefined,
    clearBio: formData.get("clearBio") === "true",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { userId, username, clearBio } = parsed.data;
  if (!username && !clearBio) return { ok: false, error: "Nothing to change." };

  const admin = createSupabaseAdminClient();
  const update: Record<string, unknown> = {};
  if (username) update.username = username;
  if (clearBio) update.bio = null;

  const { error } = await admin.from("profiles").update(update).eq("id", userId);
  if (error) {
    return { ok: false, error: error.code === "23505" ? "That username is taken." : "That profile could not be updated." };
  }

  if (username) await recordAdminAction(viewer.userId, "rename_user", "user", userId, { username });
  if (clearBio) await recordAdminAction(viewer.userId, "clear_bio", "user", userId);

  refreshAdmin();
  return { ok: true, data: undefined };
}
