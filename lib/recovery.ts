import "server-only";
import { cookies } from "next/headers";

/**
 * The marker that says a session came from a recovery link.
 *
 * Supabase issues an ordinary session when somebody clicks a password reset link,
 * with nothing on the server side to distinguish it from any other sign in. So the
 * callback route sets this when, and only when, it exchanges a code whose `next` is
 * the reset page, and /auth/reset requires it. Without that, /auth/reset would be a
 * change password form for anyone already signed in, reachable by typing the URL.
 *
 * httpOnly so no script can forge it, short lived so an abandoned reset does not
 * leave a usable door open, and cleared the moment the password actually changes so
 * a back button cannot replay it.
 */
export const RECOVERY_COOKIE = "askgta6_recovery";

/**
 * Where a recovery link lands once the callback route has exchanged the code, and
 * the only `next` value that earns the marker.
 *
 * It lives here rather than beside the action that uses it because a "use server"
 * module may only export async functions.
 */
export const PASSWORD_RESET_PATH = "/auth/reset";

/** Long enough to pick a password, short enough not to linger. */
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60;

export const RECOVERY_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: RECOVERY_MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === "production",
} as const;

export async function hasRecoveryMarker(): Promise<boolean> {
  return (await cookies()).get(RECOVERY_COOKIE)?.value === "1";
}

export async function clearRecoveryMarker(): Promise<void> {
  (await cookies()).delete(RECOVERY_COOKIE);
}
