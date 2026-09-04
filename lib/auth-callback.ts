import "server-only";
import { headers } from "next/headers";

export { siteUrl } from "./site";

/** The one path Supabase is ever allowed to send a person back to. */
export const AUTH_CALLBACK_PATH = "/auth/callback";

function isLoopback(host: string): boolean {
  const name = host.split(":")[0]!.toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "0.0.0.0" || name === "[::1]";
}

/** A forwarded header can carry a comma separated chain. The first hop is the client's. */
function firstHop(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * The origin this request actually arrived on.
 *
 * On Vercel the platform edge sets x-forwarded-host and x-forwarded-proto, and it
 * only routes hosts configured on the project, so this is the domain the person is
 * looking at rather than whatever a build time variable was set to six deploys ago.
 * Supabase's own redirect allow list is still the gate on where a link may point,
 * so a forged host cannot turn this into an open redirect: it produces a URL the
 * project rejects.
 */
async function requestOrigin(): Promise<string | null> {
  let store: Awaited<ReturnType<typeof headers>>;
  try {
    store = await headers();
  } catch {
    // No request in scope: a build time render, a script, or a test.
    return null;
  }

  const host = firstHop(store.get("x-forwarded-host")) ?? firstHop(store.get("host"));
  if (!host) return null;

  // A loopback host outside development is the bug this function exists to stop.
  if (isLoopback(host) && process.env.NODE_ENV !== "development") return null;

  const proto = firstHop(store.get("x-forwarded-proto")) ?? (isLoopback(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The origin every auth email and OAuth handoff is built from.
 *
 * Order is deliberate. The live request wins, because it cannot be stale. The
 * configured origin is the fallback for anything rendered outside a request.
 * Localhost is only ever reached in development, so a missing or wrong variable
 * in production throws here rather than mailing somebody a link to their own
 * machine.
 */
export async function authOrigin(): Promise<string> {
  const fromRequest = await requestOrigin();
  if (fromRequest) return fromRequest;

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured && !(isLoopback(new URL(configured).host) && process.env.NODE_ENV === "production")) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";

  throw new Error(
    "No origin for an auth redirect. No request headers, and NEXT_PUBLIC_SITE_URL is unset or points at localhost.",
  );
}

/**
 * Where Supabase sends a person after they click a confirmation, recovery, or
 * magic link.
 *
 * Every signUp, signInWithOtp, signInWithOAuth, and resetPasswordForEmail call
 * goes through this and nothing else builds an auth redirect.
 * tests/unit/auth-redirect.test.ts scans the source and fails if one ever does.
 *
 * `next` is where the callback route sends the person once it has exchanged the
 * code, so a recovery link can land on the new password form rather than the feed.
 * It has to be a path on this site; the callback route refuses anything else.
 *
 * The origin must also be in the project's redirect allow list under
 * Authentication, URL Configuration, or Supabase discards it and substitutes its
 * own Site URL, which is a bare origin with no path. lib/auth-errors.ts has the
 * copy for the case where it refuses outright.
 */
export async function authCallbackUrl(next?: string): Promise<string> {
  const url = `${await authOrigin()}${AUTH_CALLBACK_PATH}`;
  return next ? `${url}?next=${encodeURIComponent(next)}` : url;
}
