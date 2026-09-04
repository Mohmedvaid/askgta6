import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recovery = { present: true };
const auth = { user: null as { id: string } | null, exchangeError: null as { message: string } | null };

vi.mock("@/lib/recovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recovery")>()),
  hasRecoveryMarker: async () => recovery.present,
  clearRecoveryMarker: async () => undefined,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({
        data: { user: auth.user },
        error: auth.exchangeError,
      }),
    },
  }),
}));

vi.mock("@/lib/viewer", () => ({ getViewer: async () => auth.user }));

vi.mock("@/lib/adopt-progress", () => ({ adoptAnonymousShield: async () => null }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const ResetPasswordPage = (await import("@/app/auth/reset/page")).default;
const { GET } = await import("@/app/auth/callback/route");

async function redirectFrom(run: () => Promise<unknown>): Promise<string> {
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
  recovery.present = true;
  auth.user = { id: "user-1" };
  auth.exchangeError = null;
});

describe("/auth/reset", () => {
  it("renders the form when both gates pass", async () => {
    await expect(ResetPasswordPage()).resolves.toBeTruthy();
  });

  it("rejects a request with no recovery session", async () => {
    auth.user = null;
    expect(await redirectFrom(() => ResetPasswordPage())).toBe("/auth/forgot");
  });

  it("rejects a signed in reader who did not arrive through a recovery link", async () => {
    // The marker is what separates a recovery session from an ordinary one, so
    // without it this page is not a change password form for whoever is logged in.
    recovery.present = false;
    expect(await redirectFrom(() => ResetPasswordPage())).toBe("/auth/forgot");
  });

  it("checks the marker before it checks the session, so neither answer differs", async () => {
    recovery.present = false;
    auth.user = null;
    expect(await redirectFrom(() => ResetPasswordPage())).toBe("/auth/forgot");
  });
});

describe("/auth/callback", () => {
  const request = (query: string) => new NextRequest(`https://askgta6.com/auth/callback${query}`);

  it("marks the session as a recovery one only for the reset page", async () => {
    const response = await GET(request("?code=abc&next=%2Fauth%2Freset"));

    expect(response.headers.get("location")).toBe("https://askgta6.com/auth/reset");
    expect(response.headers.get("set-cookie")).toContain("askgta6_recovery=1");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("sets no marker for an ordinary confirmation", async () => {
    const response = await GET(request("?code=abc"));

    expect(response.headers.get("location")).toBe("https://askgta6.com/onboarding");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("askgta6_recovery");
  });

  it("refuses to forward to another site, whatever next says", async () => {
    for (const hostile of ["https://evil.example", "//evil.example", "/\\\\evil.example"]) {
      const response = await GET(request(`?code=abc&next=${encodeURIComponent(hostile)}`));
      expect(response.headers.get("location")).toBe("https://askgta6.com/onboarding");
    }
  });

  it("sends a failed exchange back to sign in", async () => {
    auth.exchangeError = { message: "bad code" };
    const response = await GET(request("?code=abc&next=%2Fauth%2Freset"));

    expect(response.headers.get("location")).toBe("https://askgta6.com/auth/sign-in?error=link");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("askgta6_recovery");
  });
});
