import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerStore: { headers: Record<string, string> | null } = { headers: null };

vi.mock("next/headers", () => ({
  headers: async () => {
    if (!headerStore.headers) throw new Error("no request in scope");
    const entries = headerStore.headers;
    return { get: (name: string) => entries[name.toLowerCase()] ?? null };
  },
}));

const { AUTH_CALLBACK_PATH, authCallbackUrl } = await import("@/lib/auth-callback");

function setMode(mode: "development" | "production") {
  vi.stubEnv("NODE_ENV", mode);
}

beforeEach(() => {
  headerStore.headers = null;
  // Production, with nothing configured, is the state that has to fail loudly.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
  setMode("production");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authCallbackUrl", () => {
  it("prefers the origin the request actually arrived on", async () => {
    // The stale build time value that caused this bug, alongside the real request.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    headerStore.headers = { "x-forwarded-host": "askgta6.com", "x-forwarded-proto": "https" };

    expect(await authCallbackUrl()).toBe("https://askgta6.com/auth/callback");
  });

  it("takes the first hop when a proxy chain forwards several", async () => {
    headerStore.headers = {
      "x-forwarded-host": "askgta6.com, internal.vercel.app",
      "x-forwarded-proto": "https, http",
    };

    expect(await authCallbackUrl()).toBe("https://askgta6.com/auth/callback");
  });

  it("falls back to the host header, and assumes https off localhost", async () => {
    headerStore.headers = { host: "askgta6.com" };
    expect(await authCallbackUrl()).toBe("https://askgta6.com/auth/callback");
  });

  it("ignores a loopback request origin in production", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://askgta6.com");
    headerStore.headers = { "x-forwarded-host": "localhost:3000", "x-forwarded-proto": "http" };

    expect(await authCallbackUrl()).toBe("https://askgta6.com/auth/callback");
  });

  it("uses the configured origin when there is no request in scope", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://askgta6.com/");
    expect(await authCallbackUrl()).toBe("https://askgta6.com/auth/callback");
  });

  it("throws in production rather than mailing a link to localhost", async () => {
    await expect(authCallbackUrl()).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    await expect(authCallbackUrl()).rejects.toThrow(/localhost/);
  });

  it("still allows localhost in development", async () => {
    setMode("development");
    expect(await authCallbackUrl()).toBe("http://localhost:3000/auth/callback");

    headerStore.headers = { host: "localhost:3000" };
    expect(await authCallbackUrl()).toBe("http://localhost:3000/auth/callback");
  });

  it("always ends in the callback path, never a bare origin", async () => {
    headerStore.headers = { "x-forwarded-host": "askgta6.com", "x-forwarded-proto": "https" };
    const url = await authCallbackUrl();

    expect(AUTH_CALLBACK_PATH).toBe("/auth/callback");
    expect(url.endsWith(AUTH_CALLBACK_PATH)).toBe(true);
    expect(new URL(url).pathname).toBe(AUTH_CALLBACK_PATH);
  });
});

/**
 * The redirect is only correct if every auth call goes through the one builder.
 * These scan the source rather than a mock, because the failure this guards against
 * is somebody adding a second call site, not the builder returning the wrong string.
 */
const BUILDER = "lib/auth-callback.ts";

/** Supabase auth methods that take a redirect and can therefore mail a bad link. */
const REDIRECTING_METHODS = ["signUp", "signInWithOtp", "signInWithOAuth", "resetPasswordForEmail", "resend"];

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(full)) files.push(full);
    }
  };
  ["app", "actions", "lib", "components"].forEach(walk);
  return files;
}

/** The argument text of a call, from its opening paren to the matching close. */
function callArguments(source: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  throw new Error("unbalanced call");
}

describe("every auth redirect goes through the one builder", () => {
  const files = sourceFiles().map((path) => [path, readFileSync(path, "utf8")] as const);

  it("passes await authCallbackUrl() to every redirecting auth call", () => {
    const seen: string[] = [];

    for (const [path, source] of files) {
      for (const method of REDIRECTING_METHODS) {
        const token = `auth.${method}(`;
        let at = source.indexOf(token);
        while (at !== -1) {
          const args = callArguments(source, at + token.length - 1);
          seen.push(`${path} ${method}`);
          expect(args, `${path} calls auth.${method} without the builder`).toContain("await authCallbackUrl()");
          at = source.indexOf(token, at + 1);
        }
      }
    }

    // A guard that asserted nothing would pass silently once the calls moved.
    expect(seen.sort()).toEqual([
      "app/auth/actions.ts signInWithOAuth",
      "app/auth/actions.ts signInWithOtp",
      "app/auth/actions.ts signUp",
    ]);
  });

  it("never assigns a redirect option anything but the builder", () => {
    for (const [path, source] of files) {
      for (const match of source.matchAll(/(emailRedirectTo|redirectTo)\s*:\s*([^,\n}]+)/g)) {
        expect(match[2]!.trim(), `${path} builds a redirect by hand`).toBe("await authCallbackUrl()");
      }
    }
  });

  it("builds the callback path in exactly one file", () => {
    const builders = files
      .filter(([, source]) => source.includes("/auth/callback"))
      .map(([path]) => path);

    expect(builders).toEqual([BUILDER]);
  });

  it("emits a localhost url from exactly one line, guarded by the mode", () => {
    // A loopback hostname comparison and the wording of the error are fine. What
    // must never be reachable in production is a returned http://localhost URL.
    const emitting = readFileSync(BUILDER, "utf8")
      .split("\n")
      .filter((line) => line.includes("http://localhost"))
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));

    expect(emitting).toHaveLength(1);
    expect(emitting[0]).toContain('NODE_ENV !== "production"');
  });
});
