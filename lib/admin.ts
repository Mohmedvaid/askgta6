import "server-only";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getViewer, type Viewer } from "./viewer";

/**
 * Admin lives on `profiles.is_admin`, not in an environment variable.
 *
 * The reason is row level security: a policy can read a column and cannot read a
 * Vercel variable, so an env var could only ever gate the UI while the database
 * stayed open to anyone holding a session. Moving it into the table means the two
 * agree by construction.
 */
export async function requireAdmin(): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer?.isAdmin ? viewer : null;
}

export type AdminAction =
  | "hide"
  | "unhide"
  | "delete"
  | "dismiss"
  | "ban"
  | "unban"
  | "delete_account"
  | "block_add"
  | "block_remove"
  | "rename_user"
  | "clear_bio";

export type AdminTarget = "post" | "reply" | "report" | "user" | "domain" | "phrase";

/**
 * One row per thing an admin did.
 *
 * Written with the service role key because `admin_actions` takes no client
 * writes at all: an audit trail a moderator can forge is not an audit trail. A
 * failure here is logged and swallowed, because losing the log entry is not a
 * reason to leave a hidden post visible.
 */
export async function recordAdminAction(
  actorId: string,
  action: AdminAction,
  targetType: AdminTarget,
  targetId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("admin_actions").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    detail,
  });

  if (error) console.error("[admin] audit write failed", { action, targetType, message: error.message });
}
