import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { adoptAnonymousShield } from "@/lib/adopt-progress";
import { logAuthError } from "@/lib/auth-errors";
import { PASSWORD_RESET_PATH, RECOVERY_COOKIE, RECOVERY_COOKIE_OPTIONS } from "@/lib/recovery";

/**
 * `next` comes off the query string, so it is attacker controlled. Only a path on
 * this site is allowed: a value like `https://evil.example`, or a protocol relative
 * `//evil.example`, would otherwise turn this route into an open redirect that
 * borrows the trust of an email we sent.
 */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/onboarding";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Magic link and OAuth land here rather than in the sign up action, so the
      // guest cookie is adopted on this path too.
      if (data.user) await adoptAnonymousShield(supabase, data.user.id);

      const response = NextResponse.redirect(new URL(next, request.url));
      // Only a link that asked for the reset page gets the marker that page requires.
      if (next === PASSWORD_RESET_PATH) response.cookies.set(RECOVERY_COOKIE, "1", RECOVERY_COOKIE_OPTIONS);
      return response;
    }

    logAuthError("exchangeCodeForSession", error);
  }

  return NextResponse.redirect(new URL("/auth/sign-in?error=link", request.url));
}
