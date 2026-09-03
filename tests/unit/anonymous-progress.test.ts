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

const { PROGRESS_COOKIE, parseProgressCookie, readAnonymousProgress, writeAnonymousProgress, clearAnonymousProgress } =
  await import("@/lib/anonymous-progress");
const { adoptAnonymousProgress } = await import("@/lib/adopt-progress");
const { getViewerProgress, needsProgressPrompt } = await import("@/lib/viewer");
const { dismissProgressPrompt, setProgress } = await import("@/actions/profile");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
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

describe("parseProgressCookie", () => {
  it("reads a level a browser actually sent", () => {
    expect(parseProgressCookie("0")).toBe(0);
    expect(parseProgressCookie("3")).toBe(3);
    expect(parseProgressCookie("7")).toBe(7);
  });

  it("clamps a level past the top of the list", () => {
    expect(parseProgressCookie("9")).toBe(7);
    expect(parseProgressCookie("99999")).toBe(7);
  });

  it("returns null for absent, empty, and junk values", () => {
    expect(parseProgressCookie(undefined)).toBeNull();
    expect(parseProgressCookie("")).toBeNull();
    expect(parseProgressCookie("   ")).toBeNull();
    expect(parseProgressCookie("three")).toBeNull();
    expect(parseProgressCookie("-1")).toBeNull();
    expect(parseProgressCookie("2.5")).toBeNull();
    expect(parseProgressCookie("<script>")).toBeNull();
  });
});

describe("the cookie itself", () => {
  it("round trips through the jar", async () => {
    expect(await readAnonymousProgress()).toBeNull();

    await writeAnonymousProgress(4);
    expect(await readAnonymousProgress()).toBe(4);

    await clearAnonymousProgress();
    expect(await readAnonymousProgress()).toBeNull();
  });

  it("lasts a year and is lax", async () => {
    await writeAnonymousProgress(2);
    const record = jar.get(PROGRESS_COOKIE);

    expect(PROGRESS_COOKIE).toBe("askgta6_progress");
    expect(record?.options).toMatchObject({ path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  });
});

describe("getViewerProgress for a logged out reader", () => {
  it("defaults to 0 with no cookie", async () => {
    expect(await getViewerProgress()).toBe(0);
  });

  it("reads the cookie when there is one", async () => {
    await writeAnonymousProgress(5);
    expect(await getViewerProgress()).toBe(5);
  });

  it("reads level 0 from an explicit cookie the same as from no cookie", async () => {
    await writeAnonymousProgress(0);
    expect(await getViewerProgress()).toBe(0);
  });
});

describe("needsProgressPrompt", () => {
  it("is true for a visitor who has never answered", async () => {
    expect(await needsProgressPrompt()).toBe(true);
  });

  it("is false once any level is recorded, including 0", async () => {
    await writeAnonymousProgress(0);
    expect(await needsProgressPrompt()).toBe(false);

    jar.clear();
    await writeAnonymousProgress(6);
    expect(await needsProgressPrompt()).toBe(false);
  });

  it("is false for a signed in reader whatever the cookie says", async () => {
    authUser.current = { id: "user-1" };
    holder.client = createFakeClient({
      tables: { profiles: { data: { id: "user-1", username: "mara", progress: 3, theme: "dark" }, error: null } },
    });

    expect(await needsProgressPrompt()).toBe(false);
  });
});

describe("setProgress for a logged out reader", () => {
  it("writes the cookie instead of calling the database", async () => {
    const result = await setProgress(null, form({ progress: "6" }));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(jar.get(PROGRESS_COOKIE)?.value).toBe("6");
    expect(holder.client.calls.some((call) => call.method === "rpc")).toBe(false);
  });

  it("still rejects a level outside the list", async () => {
    expect(await setProgress(null, form({ progress: "12" }))).toMatchObject({ ok: false });
    expect(jar.has(PROGRESS_COOKIE)).toBe(false);
  });
});

describe("dismissProgressPrompt", () => {
  it("records 0 so the sheet never asks twice", async () => {
    expect(await needsProgressPrompt()).toBe(true);

    await dismissProgressPrompt();

    expect(jar.get(PROGRESS_COOKIE)?.value).toBe("0");
    expect(await needsProgressPrompt()).toBe(false);
  });
});

describe("adoptAnonymousProgress on signup", () => {
  it("copies the guest cookie onto the new profile and drops the cookie", async () => {
    await writeAnonymousProgress(5);
    holder.client = createFakeClient({ tables: { profiles: { data: null, error: null } } });

    const adopted = await adoptAnonymousProgress(holder.client as never, "user-1");

    expect(adopted).toBe(5);
    const update = holder.client.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({ progress: 5 });
    expect(jar.has(PROGRESS_COOKIE)).toBe(false);
  });

  it("copies an explicit level 0 too, because that is an answer", async () => {
    await writeAnonymousProgress(0);
    holder.client = createFakeClient({ tables: { profiles: { data: null, error: null } } });

    expect(await adoptAnonymousProgress(holder.client as never, "user-1")).toBe(0);
    expect(holder.client.calls.find((call) => call.method === "update")?.args[0]).toEqual({ progress: 0 });
  });

  it("does nothing when there is no cookie to carry", async () => {
    holder.client = createFakeClient();

    expect(await adoptAnonymousProgress(holder.client as never, "user-1")).toBeNull();
    expect(holder.client.calls.some((call) => call.method === "update")).toBe(false);
  });

  it("leaves the cookie in place when the update fails", async () => {
    await writeAnonymousProgress(3);
    holder.client = createFakeClient({ tables: { profiles: { data: null, error: { message: "nope" } } } });

    expect(await adoptAnonymousProgress(holder.client as never, "user-1")).toBeNull();
    expect(jar.get(PROGRESS_COOKIE)?.value).toBe("3");
  });
});
