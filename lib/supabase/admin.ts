import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service role client. It bypasses row level security entirely, so only the seed
 * script and the admin actions may use it, and every one of those calls
 * requireAdmin() from lib/admin.ts first.
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
