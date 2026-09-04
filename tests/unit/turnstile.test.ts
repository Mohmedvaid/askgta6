import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_FIELD, turnstileEnabled, turnstileSiteKey, verifyTurnstile } from "@/lib/turnstile";

const fetchMock = vi.fn();
let logged: unknown[][] = [];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "a-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ok = (body: Record<string, unknown>) => ({ json: async () => body }) as unknown as Response;

describe("when Turnstile is switched off", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_ENABLED", "false");
  });

  it("passes without a token and without asking Cloudflare", async () => {
    expect(turnstileEnabled()).toBe(false);
    expect(await verifyTurnstile(null)).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes even with a nonsense token, because nothing is being checked", async () => {
    expect(await verifyTurnstile("not-a-real-token")).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("when Turnstile is switched on", () => {
  it("accepts a token Cloudflare says is good", async () => {
    fetchMock.mockResolvedValue(ok({ success: true }));

    expect(await verifyTurnstile("a-token")).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = new URLSearchParams((init as { body: URLSearchParams }).body);
    expect(body.get("secret")).toBe("a-secret");
    expect(body.get("response")).toBe("a-token");
  });

  it("passes the client address along when there is one", async () => {
    fetchMock.mockResolvedValue(ok({ success: true }));
    await verifyTurnstile("a-token", "203.0.113.7");

    const body = new URLSearchParams((fetchMock.mock.calls[0]![1] as { body: URLSearchParams }).body);
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("refuses a form that carried no token at all", async () => {
    expect(await verifyTurnstile(null)).toEqual({ ok: false, reason: "missing_token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a token Cloudflare rejects, and names the codes in the log", async () => {
    fetchMock.mockResolvedValue(ok({ success: false, "error-codes": ["invalid-input-response"] }));

    expect(await verifyTurnstile("a-stale-token")).toEqual({ ok: false, reason: "invalid-input-response" });
    expect(String(logged[0]![0])).toBe("[turnstile] verification failed");
    expect(JSON.stringify(logged)).not.toContain("a-secret");
    expect(JSON.stringify(logged)).not.toContain("a-stale-token");
  });

  it("fails closed when it is on without a secret, because failing open would be a lie", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    expect(await verifyTurnstile("a-token")).toEqual({ ok: false, reason: "not_configured" });
    expect(String(logged[0]![0])).toContain("TURNSTILE_SECRET_KEY is not set");
  });

  it("fails open when Cloudflare is unreachable, so an outage there is not one here", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    expect(await verifyTurnstile("a-token")).toEqual({ ok: true });
    expect(String(logged[0]![0])).toBe("[turnstile] verification could not be reached");
  });
});

describe("the pieces the forms use", () => {
  it("names the field Cloudflare's widget writes into", () => {
    expect(TURNSTILE_FIELD).toBe("cf-turnstile-response");
  });

  it("reads the site key from the public variable, empty when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x000000");
    expect(turnstileSiteKey()).toBe("0x000000");

    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(turnstileSiteKey()).toBe("");
  });
});
