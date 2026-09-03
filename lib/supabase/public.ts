import { cache } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client with no session and no cookies.
 *
 * Reading cookies is what makes a route dynamic, so anything that has to be
 * prerendered reads through this instead. It sees exactly what a logged out
 * visitor sees, which for the landing page is the whole point.
 */
export const createSupabasePublicClient = cache(() =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
);
