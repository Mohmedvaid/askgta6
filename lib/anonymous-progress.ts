import { cookies } from "next/headers";
import { SPOILER_SHIELD_DEFAULT, clampProgress, type SpoilerLevel } from "./spoilers";

export const PROGRESS_COOKIE = "askgta6_progress";
export const SHIELD_COOKIE = "askgta6_shield";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const COOKIE_OPTIONS = { path: "/", maxAge: ONE_YEAR_SECONDS, sameSite: "lax" } as const;

/**
 * A logged out reader's shield lives in two cookies: whether it is on, and the
 * level it is set to. Both are absent until they touch the control, and absent
 * means the shipped default: shield off, level 0.
 */
export function parseProgressCookie(raw: string | undefined): SpoilerLevel | null {
  if (raw === undefined || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  return clampProgress(raw.trim());
}

export function parseShieldCookie(raw: string | undefined): boolean | null {
  if (raw === "on") return true;
  if (raw === "off") return false;
  return null;
}

export async function readAnonymousProgress(): Promise<SpoilerLevel | null> {
  return parseProgressCookie((await cookies()).get(PROGRESS_COOKIE)?.value);
}

export async function readAnonymousShield(): Promise<boolean> {
  return parseShieldCookie((await cookies()).get(SHIELD_COOKIE)?.value) ?? SPOILER_SHIELD_DEFAULT;
}

export async function writeAnonymousShield(enabled: boolean, level: SpoilerLevel): Promise<void> {
  const store = await cookies();
  store.set(SHIELD_COOKIE, enabled ? "on" : "off", COOKIE_OPTIONS);
  store.set(PROGRESS_COOKIE, String(level), COOKIE_OPTIONS);
}

export async function clearAnonymousShield(): Promise<void> {
  const store = await cookies();
  store.delete(PROGRESS_COOKIE);
  store.delete(SHIELD_COOKIE);
}
