import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";

const holder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => holder.client }));

const { LINK_MIN_UPVOTES, LINK_PRIVILEGE_ERROR, checkLinkPrivilege } = await import("@/lib/link-privilege");
import type { Viewer } from "@/lib/viewer";

const VIEWER: Viewer = {
  userId: "user-1",
  username: "dex",
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

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

function stats(accepted: number, upvotes: number) {
  holder.client = createFakeClient({
    rpc: { link_privilege_stats: { data: [{ accepted_answers: accepted, upvotes_received: upvotes }], error: null } },
  });
}

beforeEach(() => {
  stats(0, 0);
});

describe("an account under a day old with nothing to show", () => {
  it("cannot post links, and the error names both ways out", async () => {
    const result = await checkLinkPrivilege(VIEWER, hoursAgo(2));

    expect(result).toEqual({ allowed: false, reason: LINK_PRIVILEGE_ERROR });
    expect(LINK_PRIVILEGE_ERROR).toContain("a day old");
    expect(LINK_PRIVILEGE_ERROR).toContain("accepted answer");
    expect(LINK_PRIVILEGE_ERROR).toContain(String(LINK_MIN_UPVOTES));
  });
});

describe("the age bar", () => {
  it("clears at 24 hours", async () => {
    expect(await checkLinkPrivilege(VIEWER, hoursAgo(25))).toEqual({ allowed: true });
  });

  it("does not clear at 23 hours", async () => {
    expect(await checkLinkPrivilege(VIEWER, hoursAgo(23))).toMatchObject({ allowed: false });
  });

  it("does not ask for reputation once age has cleared it", async () => {
    const fake = holder.client;
    await checkLinkPrivilege(VIEWER, hoursAgo(48));
    expect(fake.calls.some((call) => call.method === "rpc")).toBe(false);
  });
});

describe("the reputation bar", () => {
  it("clears on a single accepted answer, however new the account", async () => {
    stats(1, 0);
    expect(await checkLinkPrivilege(VIEWER, hoursAgo(1))).toEqual({ allowed: true });
  });

  it("clears at three upvotes", async () => {
    stats(0, 3);
    expect(await checkLinkPrivilege(VIEWER, hoursAgo(1))).toEqual({ allowed: true });
  });

  it("does not clear at two", async () => {
    stats(0, 2);
    expect(await checkLinkPrivilege(VIEWER, hoursAgo(1))).toMatchObject({ allowed: false });
  });
});

describe("admins", () => {
  it("are exempt, because moderating means linking to things", async () => {
    const fake = holder.client;
    expect(await checkLinkPrivilege({ ...VIEWER, isAdmin: true }, hoursAgo(0))).toEqual({ allowed: true });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("when the join date is not to hand", () => {
  it("reads it from the profile rather than assuming either way", async () => {
    holder.client = createFakeClient({
      tables: { profiles: { data: { created_at: hoursAgo(72) }, error: null } },
    });

    expect(await checkLinkPrivilege(VIEWER)).toEqual({ allowed: true });
    expect(holder.client.calls).toContainEqual({ method: "from", args: ["profiles"] });
  });
});
