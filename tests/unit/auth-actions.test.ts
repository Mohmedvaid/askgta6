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
      resetPasswordForEmail: record("resetPasswordForEmail"),
      updateUser: record("updateUser"),
    },
  }),
}));

vi.mock("@/lib/adopt-progress", () => ({ adoptAnonymousShield: async () => null }));

const viewer: { current: { userId: string } | null } = { current: { userId: "user-1" } };

vi.mock("@/lib/viewer", () => ({ getViewer: async () => viewer.current }));

// Magic link is switched off in the app. These tests flip it back on so the
// implementation stays covered while it is disabled, and switch it off again to
// prove the guard. See lib/auth-features.ts.
const features = { MAGIC_LINK_ENABLED: true, PASSWORD_RESET_ENABLED: true };

vi.mock("@/lib/auth-features", () => ({
  get MAGIC_LINK_ENABLED() {
    return features.MAGIC_LINK_ENABLED;
  },
  get PASSWORD_RESET_ENABLED() {
    return features.PASSWORD_RESET_ENABLED;
  },
}));

const recovery = { cleared: 0 };

vi.mock("@/lib/recovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recovery")>()),
  clearRecoveryMarker: async () => {
    recovery.cleared += 1;
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { requestPasswordReset, sendMagicLink, signIn, signOut, signUp, updatePassword } = await import(
  "@/app/auth/actions"
);
const { PASSWORD_RESET_PATH } = await vi.importActual<typeof import("@/lib/recovery")>("@/lib/recovery");
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
  features.PASSWORD_RESET_ENABLED = true;
  recovery.cleared = 0;
  viewer.current = { userId: "user-1" };
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
      error: "That email is already registered. Sign in instead, or use the Forgot password link on the sign in page.",
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

describe("requestPasswordReset", () => {
  const NEUTRAL = { ok: true, data: undefined };

  it("answers the same way for an address with an account and one without", async () => {
    // The address exists and Supabase is happy.
    const existing = await requestPasswordReset(null, form({ email: VALID.email }));

    // The address does not exist. Supabase reports it; the reader must not learn it.
    results.resetPasswordForEmail = {
      data: {},
      error: { code: "user_not_found", status: 400, message: "User not found" },
    };
    const unknown = await requestPasswordReset(null, form({ email: "nobody@example.com" }));

    expect(existing).toEqual(NEUTRAL);
    expect(unknown).toEqual(NEUTRAL);
    expect(unknown).toEqual(existing);
  });

  it("gives a malformed address the same answer, and never asks Supabase", async () => {
    expect(await requestPasswordReset(null, form({ email: "not-an-email" }))).toEqual(NEUTRAL);
    expect(calls).toHaveLength(0);
  });

  it("gives a tripped honeypot the same answer, and sends nothing", async () => {
    expect(await requestPasswordReset(null, form({ email: VALID.email, [HONEYPOT_FIELD]: "x" }))).toEqual(NEUTRAL);
    expect(calls).toHaveLength(0);
  });

  it("sends the reader back through the callback to the reset page", async () => {
    await requestPasswordReset(null, form({ email: VALID.email }));

    const [address, options] = calls[0]!.args as [string, { redirectTo: string }];
    expect(address).toBe(VALID.email);

    const url = new URL(options.redirectTo);
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe(PASSWORD_RESET_PATH);
    expect(PASSWORD_RESET_PATH).toBe("/auth/reset");
    expect(options.redirectTo).toBe(await authCallbackUrl(PASSWORD_RESET_PATH));
  });

  it("logs a Supabase failure without changing what the reader sees", async () => {
    results.resetPasswordForEmail = {
      data: {},
      error: { code: "over_email_send_rate_limit", status: 429, message: "rate limited" },
    };

    expect(await requestPasswordReset(null, form({ email: VALID.email }))).toEqual(NEUTRAL);
    expect(String(logged[0]![0])).toBe("[auth] requestPasswordReset failed");
    expect(JSON.stringify(logged)).not.toContain(VALID.email);
  });

  it("stays neutral, and sends nothing, when the feature is switched off", async () => {
    features.PASSWORD_RESET_ENABLED = false;

    expect(await requestPasswordReset(null, form({ email: VALID.email }))).toEqual(NEUTRAL);
    expect(calls).toHaveLength(0);
    expect(String(logged[0]![0])).toBe("[auth] requestPasswordReset failed");
  });

  it("ships switched on", async () => {
    const actual = await vi.importActual<typeof import("@/lib/auth-features")>("@/lib/auth-features");
    expect(actual.PASSWORD_RESET_ENABLED).toBe(true);
  });
});

describe("updatePassword", () => {
  const GOOD = { password: "a-new-password", confirm: "a-new-password" };

  it("refuses two passwords that do not match, before touching Supabase", async () => {
    const result = await updatePassword(null, form({ password: "a-new-password", confirm: "something-else" }));

    expect(result).toEqual({ ok: false, error: "Those two passwords do not match." });
    expect(calls).toHaveLength(0);
  });

  it("refuses a password under eight characters", async () => {
    expect(await updatePassword(null, form({ password: "short", confirm: "short" }))).toEqual({
      ok: false,
      error: "Passwords are at least 8 characters.",
    });
    expect(calls).toHaveLength(0);
  });

  it("refuses when the session is gone, rather than trusting the page that rendered it", async () => {
    viewer.current = null;

    expect(await updatePassword(null, form(GOOD))).toEqual({
      ok: false,
      error: "That reset link has expired. Ask for a new one.",
    });
    expect(calls.map((call) => call.method)).not.toContain("updateUser");
  });

  it("saves the password, clears the recovery marker, and moves on", async () => {
    expect(await captureRedirect(() => updatePassword(null, form(GOOD)))).toBe("/settings");
    expect(calls.map((call) => call.method)).toContain("updateUser");
    expect(recovery.cleared).toBe(1);
  });

  it("maps a Supabase failure and leaves the marker alone", async () => {
    results.updateUser = {
      data: {},
      error: { code: "weak_password", status: 422, message: "Password is too weak" },
    };

    const result = await updatePassword(null, form(GOOD));

    expect(result).toMatchObject({ ok: false });
    expect(String(logged[0]![0])).toBe("[auth] updatePassword failed");
    expect(recovery.cleared).toBe(0);
  });
});
