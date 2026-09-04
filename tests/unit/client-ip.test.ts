import { describe, expect, it, vi } from "vitest";

const headerStore: { headers: Record<string, string> | null } = { headers: null };

vi.mock("next/headers", () => ({
  headers: async () => {
    if (!headerStore.headers) throw new Error("no request in scope");
    const entries = headerStore.headers;
    return { get: (name: string) => entries[name.toLowerCase()] ?? null };
  },
}));

const { clientIp, hashIp } = await import("@/lib/client-ip");

describe("clientIp", () => {
  it("takes the first hop of the forwarded chain, which is the visitor", async () => {
    // Anything after the first entry is a proxy. Taking the last would rate limit
    // the platform rather than the person.
    headerStore.headers = { "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" };
    expect(await clientIp()).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", async () => {
    headerStore.headers = { "x-real-ip": "198.51.100.4" };
    expect(await clientIp()).toBe("198.51.100.4");
  });

  it("is null when there is no request in scope, and when no header carries one", async () => {
    headerStore.headers = null;
    expect(await clientIp()).toBeNull();

    headerStore.headers = { "user-agent": "something" };
    expect(await clientIp()).toBeNull();
  });
});

describe("hashIp", () => {
  it("does not carry the address it was given", () => {
    const hashed = hashIp("203.0.113.7");

    expect(hashed).not.toContain("203.0.113.7");
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable, so the same visitor counts against the same bucket", () => {
    expect(hashIp("203.0.113.7")).toBe(hashIp("203.0.113.7"));
  });

  it("separates two addresses", () => {
    expect(hashIp("203.0.113.7")).not.toBe(hashIp("203.0.113.8"));
  });

  it("is salted, so the table is not a rainbow table of every address seen", () => {
    const original = process.env.SUPABASE_SERVICE_ROLE_KEY;

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "salt-one");
    const one = hashIp("203.0.113.7");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "salt-two");
    const two = hashIp("203.0.113.7");

    expect(one).not.toBe(two);
    vi.unstubAllEnvs();
    expect(original).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
  });
});
