import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { adoptAnonymousShield } from "@/lib/adopt-progress";
import { logAuthError } from "@/lib/auth-errors";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Magic link and OAuth land here rather than in the sign up action, so the
      // guest cookie is adopted on this path too.
      if (data.user) await adoptAnonymousShield(supabase, data.user.id);
      return NextResponse.redirect(new URL(next, request.url));
    }

    logAuthError("exchangeCodeForSession", error);
  }

  return NextResponse.redirect(new URL("/auth/sign-in?error=link", request.url));
}
