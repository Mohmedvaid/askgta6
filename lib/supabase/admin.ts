import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service role client. Only the seed script and the admin actions may use it, and
 * every admin action re-checks ADMIN_USER_IDS before calling in here.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}
