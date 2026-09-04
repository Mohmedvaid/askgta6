import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * The client's address, from the headers Vercel's edge sets.
 *
 * x-forwarded-for is a chain, and the first entry is the client. Anything after it
 * is a proxy, so taking the last would rate limit the platform rather than the
 * visitor.
 */
export async function clientIp(): Promise<string | null> {
  try {
    const store = await headers();
    const forwarded = store.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || store.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

/**
 * A salted hash, because an IP address is personal data and nothing downstream
 * needs the original. The salt keeps the table from being a rainbow table of every
 * address that ever hit the signup form.
 */
export function hashIp(ip: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "askgta6";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
