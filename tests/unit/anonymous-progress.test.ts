import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";

type CookieRecord = { value: string; options?: Record<string, unknown> };

const jar = new Map<string, CookieRecord>();
const holder: { client: FakeClient } = { client: createFakeClient() };
const authUser: { current: { id: string } | null } = { current: null };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const found = jar.get(name);
      return found ? { name, value: found.value } : undefined;
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, { value, options });
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    ...holder.client,
    auth: { getUser: async () => ({ data: { user: authUser.current } }) },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const {
  PROGRESS_COOKIE,
  SHIELD_COOKIE,
  parseProgressCookie,
  parseShieldCookie,
  readAnonymousProgress,
  readAnonymousShield,
  writeAnonymousShield,
  clearAnonymousShield,
} = await import("@/lib/anonymous-progress");
const { adoptAnonymousShield } = await import("@/lib/adopt-progress");
const { getShieldState, getViewerProgress } = await import("@/lib/viewer");
const { NO_GATING } = await import("@/lib/spoilers");
const { setSpoilerShield } = await import("@/actions/profile");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function signIn(profile: Record<string, unknown>) {
  authUser.current = { id: "user-1" };
  holder.client = createFakeClient({
    tables: { profiles: { data: { id: "user-1", username: "mara", theme: "dark", ...profile }, error: null } },
  });
}

beforeEach(() => {
  jar.clear();
  holder.client = createFakeClient();
  authUser.current = null;
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("parsing the cookies", () => {
  it("reads a level a browser actually sent", () => {
    expect(parseProgressCookie("0")).toBe(0);
    expect(parseProgressCookie("3")).toBe(3);
    expect(parseProgressCookie("9")).toBe(7);
  });

  it("returns null for absent, empty, and junk levels", () => {
    for (const junk of [undefined, "", "   ", "three", "-1", "2.5", "<script>"]) {
      expect(parseProgressCookie(junk), String(junk)).toBeNull();
    }
  });

  it("reads the shield only from the two words it writes", () => {
    expect(parseShieldCookie("on")).toBe(true);
    expect(parseShieldCookie("off")).toBe(false);

    for (const junk of [undefined, "", "true", "1", "ON", "yes"]) {
      expect(parseShieldCookie(junk), String(junk)).toBeNull();
    }
  });
});

describe("the cookies themselves", () => {
  it("round trip through the jar", async () => {
    expect(await readAnonymousProgress()).toBeNull();
    expect(await readAnonymousShield()).toBe(false);

    await writeAnonymousShield(true, 4);
    expect(await readAnonymousProgress()).toBe(4);
    expect(await readAnonymousShield()).toBe(true);

    await clearAnonymousShield();
    expect(await readAnonymousProgress()).toBeNull();
    expect(await readAnonymousShield()).toBe(false);
  });

  it("both last a year and are lax", async () => {
    await writeAnonymousShield(true, 2);

    expect(PROGRESS_COOKIE).toBe("askgta6_progress");
    expect(SHIELD_COOKIE).toBe("askgta6_shield");
    for (const name of [PROGRESS_COOKIE, SHIELD_COOKIE]) {
      expect(jar.get(name)?.options, name).toMatchObject({
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  });
});

describe("what a logged out reader gets", () => {
  it("sees everything by default, because the shield ships off", async () => {
    expect(await readAnonymousShield()).toBe(false);
    expect(await getViewerProgress()).toBe(NO_GATING);
  });

  it("keeps seeing everything after turning the shield off explicitly", async () => {
    await writeAnonymousShield(false, 5);
    expect(await getViewerProgress()).toBe(NO_GATING);
    expect(await getShieldState()).toEqual({ enabled: false, progress: 5 });
  });

  it("gets gated at their level once the shield is on", async () => {
    await writeAnonymousShield(true, 5);
    expect(await getViewerProgress()).toBe(5);
    expect(await getShieldState()).toEqual({ enabled: true, progress: 5 });
  });

  it("falls back to level 0 when the shield is on but no level was written", async () => {
    jar.set(SHIELD_COOKIE, { value: "on" });
    expect(await getViewerProgress()).toBe(0);
  });
});

describe("what a signed in reader gets", () => {
  it("sees everything while their column says the shield is off", async () => {
    signIn({ progress: 4, spoiler_shield: false });
    expect(await getViewerProgress()).toBe(NO_GATING);
    expect(await getShieldState()).toEqual({ enabled: false, progress: 4 });
  });

  it("gets gated at their column's level once it says on", async () => {
    signIn({ progress: 4, spoiler_shield: true });
    expect(await getViewerProgress()).toBe(4);
  });

  it("ignores the guest cookies entirely", async () => {
    await writeAnonymousShield(true, 7);
    signIn({ progress: 1, spoiler_shield: false });

    expect(await getViewerProgress()).toBe(NO_GATING);
    expect(await getShieldState()).toEqual({ enabled: false, progress: 1 });
  });
});

describe("setSpoilerShield for a logged out reader", () => {
  it("writes both cookies instead of calling the database", async () => {
    const result = await setSpoilerShield(null, form({ enabled: "true", progress: "6" }));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(jar.get(SHIELD_COOKIE)?.value).toBe("on");
    expect(jar.get(PROGRESS_COOKIE)?.value).toBe("6");
    expect(holder.client.calls.some((call) => call.method === "update")).toBe(false);
  });

  it("keeps the level when the shield is switched off, so turning it back on remembers", async () => {
    await setSpoilerShield(null, form({ enabled: "true", progress: "6" }));
    await setSpoilerShield(null, form({ enabled: "false", progress: "6" }));

    expect(jar.get(SHIELD_COOKIE)?.value).toBe("off");
    expect(jar.get(PROGRESS_COOKIE)?.value).toBe("6");
  });

  it("still rejects a level outside the list", async () => {
    expect(await setSpoilerShield(null, form({ enabled: "true", progress: "12" }))).toMatchObject({ ok: false });
    expect(jar.has(SHIELD_COOKIE)).toBe(false);
  });
});

describe("adoptAnonymousShield on signup", () => {
  it("carries an on shield and its level onto the new profile, then drops the cookies", async () => {
    await writeAnonymousShield(true, 5);
    holder.client = createFakeClient({ tables: { profiles: { data: null, error: null } } });

    expect(await adoptAnonymousShield(holder.client as never, "user-1")).toEqual({ enabled: true, progress: 5 });
    expect(holder.client.calls.find((call) => call.method === "update")?.args[0]).toEqual({
      progress: 5,
      spoiler_shield: true,
    });
    expect(jar.has(PROGRESS_COOKIE)).toBe(false);
    expect(jar.has(SHIELD_COOKIE)).toBe(false);
  });

  it("carries a level chosen while the shield was off, so it is there when they turn it on", async () => {
    await writeAnonymousShield(false, 3);
    holder.client = createFakeClient({ tables: { profiles: { data: null, error: null } } });

    expect(await adoptAnonymousShield(holder.client as never, "user-1")).toEqual({ enabled: false, progress: 3 });
  });

  it("does nothing for a guest who never touched the control", async () => {
    holder.client = createFakeClient();

    expect(await adoptAnonymousShield(holder.client as never, "user-1")).toBeNull();
    expect(holder.client.calls.some((call) => call.method === "update")).toBe(false);
  });

  it("leaves the cookies in place when the update fails", async () => {
    await writeAnonymousShield(true, 3);
    holder.client = createFakeClient({ tables: { profiles: { data: null, error: { message: "nope" } } } });

    expect(await adoptAnonymousShield(holder.client as never, "user-1")).toBeNull();
    expect(jar.get(PROGRESS_COOKIE)?.value).toBe("3");
    expect(jar.get(SHIELD_COOKIE)?.value).toBe("on");
  });
});
