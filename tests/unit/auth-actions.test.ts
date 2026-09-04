import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthCall = { method: string; args: unknown[] };

const calls: AuthCall[] = [];
const results: Record<string, unknown> = {};

function record(method: string) {
  return async (...args: unknown[]) => {
    calls.push({ method, args });
    return results[method] ?? { data: {}, error: null };
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: record("signInWithPassword"),
      signUp: record("signUp"),
      signInWithOtp: record("signInWithOtp"),
      signInWithOAuth: record("signInWithOAuth"),
      signOut: record("signOut"),
    },
  }),
}));

vi.mock("@/lib/adopt-progress", () => ({ adoptAnonymousShield: async () => null }));

// Magic link is switched off in the app. These tests flip it back on so the
// implementation stays covered while it is disabled, and switch it off again to
// prove the guard. See lib/auth-features.ts.
const features = { MAGIC_LINK_ENABLED: true };

vi.mock("@/lib/auth-features", () => ({
  get MAGIC_LINK_ENABLED() {
    return features.MAGIC_LINK_ENABLED;
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { sendMagicLink, signIn, signOut, signUp } = await import("@/app/auth/actions");
const { MAGIC_LINK_DISABLED } = await import("@/lib/auth-errors");
const { authCallbackUrl } = await import("@/lib/auth-callback");
const { HONEYPOT_FIELD } = await import("@/lib/honeypot");

let logged: unknown[][] = [];

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const VALID = { email: "reader@example.com", password: "password1" };

async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  features.MAGIC_LINK_ENABLED = true;
  calls.length = 0;
  for (const key of Object.keys(results)) delete results[key];
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signUp", () => {
  it("passes emailRedirectTo built from the site url", async () => {
    results.signUp = { data: { session: null, user: null }, error: null };
    await signUp(null, form(VALID));

    const options = (calls[0]!.args[0] as { options: { emailRedirectTo: string } }).options;
    expect(options.emailRedirectTo).toBe(await authCallbackUrl());
    expect(options.emailRedirectTo).toMatch(/\/auth\/callback$/);
  });

  it("maps an already registered email and logs the code", async () => {
    results.signUp = { data: {}, error: { code: "user_already_exists", status: 422, message: "User already registered" } };

    expect(await signUp(null, form(VALID))).toEqual({
      ok: false,
      error: "That email is already registered. Sign in instead, or reset your password.",
    });
    expect(String(logged[0]![0])).toBe("[auth] signUp failed");
    expect(JSON.stringify(logged)).not.toContain("reader@example.com");
  });

  it("maps a rate limit", async () => {
    results.signUp = { data: {}, error: { code: "over_email_send_rate_limit", status: 429, message: "rate limited" } };

    expect(await signUp(null, form(VALID))).toEqual({
      ok: false,
      error: "Too many emails sent. Try again in an hour or sign in with your password.",
    });
  });

  it("keeps the generic message for an unknown code", async () => {
    results.signUp = { data: {}, error: { code: "brand_new_code", status: 500, message: "internal" } };

    expect(await signUp(null, form(VALID))).toEqual({
      ok: false,
      error: "That did not work. Try again in a minute.",
    });
  });
});

describe("sendMagicLink while it is disabled", () => {
  it("does nothing at all, and says so", async () => {
    features.MAGIC_LINK_ENABLED = false;

    expect(await sendMagicLink(null, form({ email: VALID.email }))).toEqual({
      ok: false,
      error: MAGIC_LINK_DISABLED,
    });

    // No Supabase call, so no email, no log line, and no rate limit spent.
    expect(calls).toHaveLength(0);
    expect(logged).toHaveLength(0);
  });

  it("is the shipped state, so a stray form post reaches nothing", async () => {
    const { MAGIC_LINK_ENABLED } = await vi.importActual<typeof import("@/lib/auth-features")>(
      "@/lib/auth-features",
    );

    expect(MAGIC_LINK_ENABLED).toBe(false);
  });
});

describe("sendMagicLink when it is switched back on", () => {
  it("passes emailRedirectTo built from the site url", async () => {
    await sendMagicLink(null, form({ email: VALID.email }));

    const options = (calls[0]!.args[0] as { options: { emailRedirectTo: string } }).options;
    expect(options.emailRedirectTo).toBe(await authCallbackUrl());
  });

  it("maps a rate limit and logs it", async () => {
    results.signInWithOtp = {
      data: {},
      error: { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" },
    };

    expect(await sendMagicLink(null, form({ email: VALID.email }))).toEqual({
      ok: false,
      error: "Too many emails sent. Try again in an hour or sign in with your password.",
    });
    expect(String(logged[0]![0])).toBe("[auth] sendMagicLink failed");
  });

  it("maps a redirect that the project does not allow", async () => {
    results.signInWithOtp = {
      data: {},
      error: { code: "validation_failed", status: 400, message: "redirect_to is not allowed" },
    };

    const result = await sendMagicLink(null, form({ email: VALID.email }));
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/redirect URL is missing from the Supabase project settings/);
  });
});

describe("signIn", () => {
  it("maps invalid credentials and logs the code", async () => {
    results.signInWithPassword = {
      data: {},
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    };

    expect(await signIn(null, form(VALID))).toEqual({
      ok: false,
      error: "That email and password do not match an account.",
    });
    expect(String(logged[0]![0])).toBe("[auth] signIn failed");
    expect(JSON.stringify(logged)).not.toContain("reader@example.com");
  });

  it("redirects on success, honouring next", async () => {
    expect(await captureRedirect(() => signIn(null, form({ ...VALID, next: "/settings" })))).toBe("/settings");
    expect(await captureRedirect(() => signIn(null, form(VALID)))).toBe("/feed");
  });
});

describe("signOut", () => {
  it("clears the session and lands on the landing page", async () => {
    expect(await captureRedirect(() => signOut())).toBe("/");
    expect(calls.map((call) => call.method)).toContain("signOut");
  });

  it("still lands on the landing page when Supabase complains, and logs why", async () => {
    results.signOut = { data: {}, error: { code: "session_not_found", status: 404, message: "no session" } };

    expect(await captureRedirect(() => signOut())).toBe("/");
    expect(String(logged[0]![0])).toBe("[auth] signOut failed");
  });
});

describe("the signup honeypot", () => {
  it("answers a tripped signup exactly as it answers a real one, and creates nothing", async () => {
    const result = await signUp(null, form({ ...VALID, [HONEYPOT_FIELD]: "https://spam.example" }));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(calls).toHaveLength(0);
  });

  it("answers a tripped magic link the same way, so no email is sent", async () => {
    const result = await sendMagicLink(null, form({ email: VALID.email, [HONEYPOT_FIELD]: "x" }));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(calls).toHaveLength(0);
  });

  it("lets a real signup through when the field is left alone", async () => {
    await signUp(null, form({ ...VALID, [HONEYPOT_FIELD]: "" }));
    expect(calls.map((call) => call.method)).toContain("signUp");
  });
});
