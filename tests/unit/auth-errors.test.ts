import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENERIC_AUTH_ERROR,
  authErrorMessage,
  logAuthError,
  reportAuthError,
} from "@/lib/auth-errors";

const RATE_LIMITED = "Too many emails sent. Try again in an hour or sign in with your password.";
const REDIRECT =
  "This site is not set up to receive that sign in link yet. The redirect URL is missing from the Supabase project settings.";

let logged: unknown[][] = [];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rate limits", () => {
  it.each(["over_email_send_rate_limit", "over_request_rate_limit", "over_sms_send_rate_limit"])(
    "maps %s to the hour long wait copy",
    (code) => {
      expect(authErrorMessage({ code })).toBe(RATE_LIMITED);
    },
  );

  it("catches a bare 429 with no code at all", () => {
    expect(authErrorMessage({ status: 429, message: "Request rate limit reached" })).toBe(RATE_LIMITED);
  });

  it("catches any future code ending in rate_limit", () => {
    expect(authErrorMessage({ code: "over_something_rate_limit" })).toBe(RATE_LIMITED);
  });
});

describe("redirect not allowed", () => {
  it("names the project setting rather than blaming the reader", () => {
    expect(authErrorMessage({ code: "validation_failed", message: "redirect_to is not allowed" })).toBe(REDIRECT);
    expect(authErrorMessage({ message: "Redirect URL not allowed" })).toBe(REDIRECT);
    expect(authErrorMessage({ message: "invalid redirect url" })).toBe(REDIRECT);
  });

  it("does not fire on an unrelated validation failure", () => {
    expect(authErrorMessage({ code: "validation_failed", message: "password too short" })).toBe(
      "Check the email and password and try again.",
    );
  });
});

describe("invalid credentials", () => {
  it("says the pair does not match, not which half", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe(
      "That email and password do not match an account.",
    );
  });

  it("tells an unconfirmed account to check their inbox", () => {
    expect(authErrorMessage({ code: "email_not_confirmed" })).toBe(
      "Confirm your email address first. Check your inbox for the link.",
    );
  });
});

describe("email already registered", () => {
  it.each(["user_already_exists", "email_exists"])("maps %s to sign in instead", (code) => {
    expect(authErrorMessage({ code })).toBe(
      "That email is already registered. Sign in instead, or reset your password.",
    );
  });
});

describe("unknown codes", () => {
  it("keeps the generic message rather than leaking internals", () => {
    expect(authErrorMessage({ code: "some_new_code_2027" })).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage({ code: "", message: "boom" })).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage({})).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR);
  });

  it("never returns a raw Supabase message to the page", () => {
    const message = authErrorMessage({ code: "unmapped", message: "AuthApiError: internal db timeout at pg:5432" });
    expect(message).toBe(GENERIC_AUTH_ERROR);
    expect(message).not.toContain("pg:5432");
  });
});

describe("logging", () => {
  it("writes the code, status, and message so Vercel shows what failed", () => {
    logAuthError("signUp", { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" });

    expect(logged).toHaveLength(1);
    expect(String(logged[0]![0])).toBe("[auth] signUp failed");

    const payload = JSON.parse(String(logged[0]![1]));
    expect(payload).toEqual({
      code: "over_email_send_rate_limit",
      status: 429,
      message: "email rate limit exceeded",
    });
  });

  it("logs nothing when there was no error", () => {
    logAuthError("signIn", null);
    logAuthError("signIn", undefined);
    expect(logged).toHaveLength(0);
  });

  it("carries no email, token, password, or user id", () => {
    logAuthError("signIn", {
      code: "invalid_credentials",
      status: 400,
      message: "Invalid login credentials",
    });

    const line = JSON.stringify(logged);
    expect(line).not.toMatch(/@/);
    expect(line.toLowerCase()).not.toContain("token");
    expect(line.toLowerCase()).not.toContain("password");
    expect(Object.keys(JSON.parse(String(logged[0]![1])))).toEqual(["code", "status", "message"]);
  });
});

describe("reportAuthError", () => {
  it("logs and returns the copy in one step", () => {
    const message = reportAuthError("sendMagicLink", { code: "over_email_send_rate_limit" });

    expect(message).toBe(RATE_LIMITED);
    expect(String(logged[0]![0])).toBe("[auth] sendMagicLink failed");
  });
});
