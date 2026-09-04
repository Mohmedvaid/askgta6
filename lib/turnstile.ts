import "server-only";

/**
 * Cloudflare Turnstile, server side.
 *
 * Off unless NEXT_PUBLIC_TURNSTILE_ENABLED is "true", so a missing key is a quiet
 * no op rather than a site nobody can sign up to. When it is on, a missing or
 * failing token is a refusal: a widget that renders but is never verified is
 * decoration.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const TURNSTILE_FIELD = "cf-turnstile-response";

export function turnstileEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
}

export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
}

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

/**
 * Verifies the token a form carried.
 *
 * `remoteIp` is optional and only helps Cloudflare's own scoring. The secret never
 * reaches the browser, and neither the token nor the IP is logged.
 */
export async function verifyTurnstile(token: string | null, remoteIp?: string | null): Promise<TurnstileResult> {
  if (!turnstileEnabled()) return { ok: true };

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Enabled without a secret is a deploy mistake, not a visitor's problem. Fail
    // closed and say so in the log, because failing open would make the flag a lie.
    console.error("[turnstile] NEXT_PUBLIC_TURNSTILE_ENABLED is true but TURNSTILE_SECRET_KEY is not set");
    return { ok: false, reason: "not_configured" };
  }

  if (!token) return { ok: false, reason: "missing_token" };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (result.success) return { ok: true };

    const reason = result["error-codes"]?.join(",") ?? "rejected";
    console.error("[turnstile] verification failed", { reason });
    return { ok: false, reason };
  } catch (error) {
    // Cloudflare being unreachable must not become a sign up outage.
    console.error("[turnstile] verification could not be reached", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: true };
  }
}
