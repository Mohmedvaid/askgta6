import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";
import type { Viewer } from "@/lib/viewer";

const holder: { client: FakeClient } = { client: createFakeClient() };
const viewer: { current: Viewer | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => holder.client }));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => viewer.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => undefined }) }));

const { saveProfile } = await import("@/actions/profile");

const BASE: Viewer = {
  userId: "user-1",
  username: "mara",
  displayName: null,
  avatarPath: null,
  progress: 0,
  shieldEnabled: false,
  theme: "dark",
  isAdmin: false,
  bannedAt: null,
  bio: null,
  usernameChangedAt: null,
};

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  holder.client = createFakeClient();
  viewer.current = { ...BASE };
});

describe("saving a profile", () => {
  it("writes the username, display name, and bio", async () => {
    expect(await saveProfile(null, form({ username: "mara", displayName: "Mara", bio: "Map nerd." }))).toEqual({
      ok: true,
      data: undefined,
    });

    const update = holder.client.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({ username: "mara", display_name: "Mara", bio: "Map nerd." });
  });

  it("clears a display name and a bio that were emptied", async () => {
    await saveProfile(null, form({ username: "mara" }));

    const update = holder.client.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({ username: "mara", display_name: null, bio: null });
  });

  it("refuses a bio over 200 characters", async () => {
    expect(await saveProfile(null, form({ username: "mara", bio: "a".repeat(201) }))).toEqual({
      ok: false,
      error: "Bio is capped at 200 characters.",
    });
    expect(holder.client.calls).toHaveLength(0);
  });

  it("refuses a username that breaks the rules, before touching the database", async () => {
    expect(await saveProfile(null, form({ username: "no" }))).toMatchObject({ ok: false });
    expect(holder.client.calls).toHaveLength(0);
  });

  it("reports a taken username", async () => {
    holder.client = createFakeClient({ tables: { profiles: { data: null, error: { message: "dupe", code: "23505" } } } });

    expect(await saveProfile(null, form({ username: "taken" }))).toEqual({
      ok: false,
      error: "That username is taken.",
    });
  });
});

describe("the username cooldown, at the action layer", () => {
  it("refuses a change made inside thirty days, naming the days left", async () => {
    viewer.current = { ...BASE, usernameChangedAt: daysAgo(27) };

    const result = await saveProfile(null, form({ username: "someone_else" }));

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain("once every 30 days");
    expect((result as { error: string }).error).toMatch(/\d+ days/);
    expect(holder.client.calls).toHaveLength(0);
  });

  it("allows it once thirty days have passed", async () => {
    viewer.current = { ...BASE, usernameChangedAt: daysAgo(31) };

    expect(await saveProfile(null, form({ username: "someone_else" }))).toEqual({ ok: true, data: undefined });
  });

  it("does not block an edit that keeps the same username", async () => {
    viewer.current = { ...BASE, usernameChangedAt: daysAgo(1) };

    expect(await saveProfile(null, form({ username: "mara", bio: "Still me." }))).toEqual({
      ok: true,
      data: undefined,
    });
  });

  it("does not apply to the first change away from a generated name", async () => {
    viewer.current = { ...BASE, username: "player_abc123", usernameChangedAt: daysAgo(1) };

    expect(await saveProfile(null, form({ username: "mara" }))).toEqual({ ok: true, data: undefined });
  });

  it("still reports the cooldown if the trigger is what catches it", async () => {
    // The action's own check can be bypassed by anything that is not this action.
    holder.client = createFakeClient({
      tables: { profiles: { data: null, error: { message: "username changed too recently", code: "P0001" } } },
    });

    const result = await saveProfile(null, form({ username: "someone_else" }));
    expect((result as { error: string }).error).toContain("once every 30 days");
  });
});

describe("email", () => {
  it("is ignored even when a request carries one", async () => {
    await saveProfile(null, form({ username: "mara", email: "attacker@example.com" }));

    const update = holder.client.calls.find((call) => call.method === "update");
    expect(JSON.stringify(update?.args[0])).not.toContain("attacker@example.com");
    expect(Object.keys(update?.args[0] as object)).toEqual(["username", "display_name", "bio"]);
  });
});
