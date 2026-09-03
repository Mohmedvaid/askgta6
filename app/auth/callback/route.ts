import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { adoptAnonymousProgress } from "@/lib/adopt-progress";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Magic link and OAuth land here rather than in the sign up action, so the
      // guest cookie is adopted on this path too.
      if (data.user) await adoptAnonymousProgress(supabase, data.user.id);
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth/sign-in?error=link", request.url));
}
