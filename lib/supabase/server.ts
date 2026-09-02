import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Request scoped Supabase client that carries the signed in user's session. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Server components cannot set cookies. Middleware refreshes the session instead.
          for (const { name, value, options } of cookiesToSet) {
            try {
              cookieStore.set(name, value, options);
            } catch {
              return;
            }
          }
        },
      },
    },
  );
}
