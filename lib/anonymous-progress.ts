import { cookies } from "next/headers";
import { clampProgress, type SpoilerLevel } from "./spoilers";

export const PROGRESS_COOKIE = "askgta6_progress";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * A logged out visitor's progress lives in a cookie. The cookie being absent is
 * itself the signal that they have not been asked yet, which is what puts the
 * one time sheet on screen. Dismissing it writes 0, so it never asks twice.
 */
export function parseProgressCookie(raw: string | undefined): SpoilerLevel | null {
  if (raw === undefined || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  return clampProgress(raw.trim());
}

export async function readAnonymousProgress(): Promise<SpoilerLevel | null> {
  return parseProgressCookie((await cookies()).get(PROGRESS_COOKIE)?.value);
}

export async function writeAnonymousProgress(level: SpoilerLevel): Promise<void> {
  (await cookies()).set(PROGRESS_COOKIE, String(level), {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}

export async function clearAnonymousProgress(): Promise<void> {
  (await cookies()).delete(PROGRESS_COOKIE);
}
