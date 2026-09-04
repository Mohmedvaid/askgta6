import "server-only";
import { createSupabaseAdminClient } from "./supabase/admin";
import type { Viewer } from "./viewer";

/**
 * Who may include a link.
 *
 * A link in a post is the payload of almost every spam campaign, and the accounts
 * that carry it are minutes old with nothing else on them. So links are a privilege
 * an account earns by being around a day, or by having been useful once.
 *
 * Either bar clears it, not both: someone whose first answer was accepted an hour
 * after signing up has demonstrated more than someone who waited a day in silence.
 */
export const LINK_MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
export const LINK_MIN_UPVOTES = 3;

export const LINK_PRIVILEGE_ERROR =
  "New accounts cannot post links. You can include links once your account is a day old, or once you have an accepted answer or 3 upvotes.";

export type LinkPrivilege = { allowed: true } | { allowed: false; reason: string };

export async function checkLinkPrivilege(viewer: Viewer, createdAt?: string | null): Promise<LinkPrivilege> {
  // Moderating a forum means linking to things in it.
  if (viewer.isAdmin) return { allowed: true };

  const joined = createdAt ?? (await accountCreatedAt(viewer.userId));
  if (joined && Date.now() - new Date(joined).getTime() >= LINK_MIN_ACCOUNT_AGE_MS) {
    return { allowed: true };
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin.rpc("link_privilege_stats", { p_user_id: viewer.userId });

  const stats = (Array.isArray(data) ? data[0] : data) as
    | { accepted_answers: number; upvotes_received: number }
    | null;

  const accepted = Number(stats?.accepted_answers ?? 0);
  const upvotes = Number(stats?.upvotes_received ?? 0);

  if (accepted > 0 || upvotes >= LINK_MIN_UPVOTES) return { allowed: true };

  return { allowed: false, reason: LINK_PRIVILEGE_ERROR };
}

async function accountCreatedAt(userId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("profiles").select("created_at").eq("id", userId).maybeSingle();
  return (data as { created_at?: string } | null)?.created_at ?? null;
}
