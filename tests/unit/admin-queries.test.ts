import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient, type FakeClientOptions } from "./fake-supabase";

const holder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => holder.client }));

const { findUsers, getDailyCounts, getTotals, listRecentGroups, listRecentPosts, listReportedItems } =
  await import("@/lib/queries/admin");

const POST_A = "aaaaaaaa-1111-4111-8111-111111111111";
const POST_B = "bbbbbbbb-2222-4222-8222-222222222222";

function client(options: FakeClientOptions) {
  holder.client = createFakeClient(options);
  return holder.client;
}

beforeEach(() => {
  holder.client = createFakeClient();
});

describe("listReportedItems", () => {
  it("groups by the item reported, not by report, and counts distinct reporters", async () => {
    client({
      tables: {
        reports: {
          data: [
            { target_type: "post", target_id: POST_A, reason: "spam", note: "again", reporter_id: "r1" },
            { target_type: "post", target_id: POST_A, reason: "leak", note: null, reporter_id: "r2" },
            // The same person filing twice must not read as two people.
            { target_type: "post", target_id: POST_A, reason: "spam", note: null, reporter_id: "r1" },
          ],
          error: null,
        },
        posts: {
          data: [
            {
              id: POST_A,
              title: "A reported title",
              body: "A body.",
              is_hidden: false,
              author_id: "author-1",
              author: [{ username: "dex" }],
            },
          ],
          error: null,
        },
      },
    });

    const items = await listReportedItems();

    expect(items).toHaveLength(1);
    expect(items[0]!.reporterCount).toBe(2);
    expect(items[0]!.reasons.sort()).toEqual(["leak", "spam"]);
    expect(items[0]!.notes).toEqual(["again"]);
    expect(items[0]!.authorUsername).toBe("dex");
    expect(items[0]!.title).toBe("A reported title");
  });

  it("puts an auto hidden item above a louder one that is still up", async () => {
    client({
      tables: {
        reports: {
          data: [
            { target_type: "post", target_id: POST_A, reason: "spam", note: null, reporter_id: "r1" },
            { target_type: "post", target_id: POST_A, reason: "spam", note: null, reporter_id: "r2" },
            { target_type: "post", target_id: POST_A, reason: "spam", note: null, reporter_id: "r3" },
            { target_type: "post", target_id: POST_B, reason: "leak", note: null, reporter_id: "r4" },
          ],
          error: null,
        },
        posts: {
          data: [
            { id: POST_A, title: "Three reports, still up", body: "", is_hidden: false, author_id: "a", author: [] },
            { id: POST_B, title: "One report, auto hidden", body: "", is_hidden: true, author_id: "b", author: [] },
          ],
          error: null,
        },
      },
    });

    const items = await listReportedItems();

    // Hidden first, whatever the counts say. Five distinct reporters is what the
    // trigger acts on, so anything hidden has already cleared that bar.
    expect(items.map((item) => item.title)).toEqual(["One report, auto hidden", "Three reports, still up"]);
  });

  it("says so rather than breaking when the reported item is already gone", async () => {
    client({
      tables: {
        reports: {
          data: [{ target_type: "post", target_id: POST_A, reason: "spam", note: null, reporter_id: "r1" }],
          error: null,
        },
        posts: { data: [], error: null },
      },
    });

    const items = await listReportedItems();
    expect(items[0]!.title).toBe("Deleted");
    expect(items[0]!.authorId).toBeNull();
  });

  it("returns nothing, and asks for nothing else, when the queue is empty", async () => {
    const fake = client({ tables: { reports: { data: [], error: null } } });

    expect(await listReportedItems()).toEqual([]);
    expect(fake.calls.some((call) => call.args[0] === "posts")).toBe(false);
  });
});

describe("findUsers", () => {
  const profile = {
    id: "user-1",
    username: "dex",
    display_name: "Dex",
    created_at: "2026-01-01T00:00:00.000Z",
    is_admin: false,
    banned_at: null,
    banned_reason: null,
  };

  it("searches usernames with a like, and counts posts and reported posts", async () => {
    const fake = client({
      tables: {
        profiles: { data: [profile], error: null },
        posts: { data: [{ author_id: "user-1" }, { author_id: "user-1" }], error: null },
        reports: { data: [{ target_id: POST_A, target_type: "post" }], error: null },
      },
      authAdmin: { users: [{ id: "user-1", email: "dex@example.com" }] },
    });

    const users = await findUsers("de");

    expect(fake.calls).toContainEqual({ method: "ilike", args: ["username", "%de%"] });
    expect(users[0]).toMatchObject({ username: "dex", email: "dex@example.com", postCount: 2 });
    expect(users[0]!.reportsAgainst).toBe(2);
  });

  it("resolves an email through the auth admin API, since profiles do not hold one", async () => {
    const fake = client({
      tables: {
        profiles: { data: [profile], error: null },
        posts: { data: [], error: null },
        reports: { data: [], error: null },
      },
      authAdmin: { users: [{ id: "user-1", email: "dex@example.com" }] },
    });

    const users = await findUsers("dex@example.com");

    expect(fake.calls).toContainEqual({ method: "in", args: ["id", ["user-1"]] });
    expect(fake.calls.some((call) => call.method === "ilike")).toBe(false);
    expect(users).toHaveLength(1);
  });

  it("returns nothing when an email matches nobody", async () => {
    client({ authAdmin: { users: [{ id: "user-1", email: "dex@example.com" }] } });
    expect(await findUsers("nobody@example.com")).toEqual([]);
  });

  it("carries the ban state through", async () => {
    client({
      tables: {
        profiles: {
          data: [{ ...profile, banned_at: "2026-09-01T00:00:00.000Z", banned_reason: "spam", is_admin: true }],
          error: null,
        },
        posts: { data: [], error: null },
        reports: { data: [], error: null },
      },
      authAdmin: { users: [] },
    });

    const users = await findUsers("dex");
    expect(users[0]).toMatchObject({ isAdmin: true, bannedReason: "spam", email: null });
  });
});

describe("the content lists", () => {
  it("flattens the embedded author on recent posts", async () => {
    client({
      tables: {
        posts: {
          data: [
            {
              id: POST_A,
              title: "A title",
              is_hidden: true,
              created_at: "2026-01-01T00:00:00.000Z",
              author: [{ username: "dex" }],
            },
          ],
          error: null,
        },
      },
    });

    expect(await listRecentPosts()).toEqual([
      {
        id: POST_A,
        title: "A title",
        isHidden: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        authorUsername: "dex",
      },
    ]);
  });

  it("reads groups, treating anything but private as public", async () => {
    client({
      tables: {
        groups: {
          data: [
            { id: "g1", slug: "map", name: "Map", visibility: "private", member_count: 4, created_at: "x" },
            { id: "g2", slug: "cars", name: "Cars", visibility: "public", member_count: 9, created_at: "y" },
          ],
          error: null,
        },
      },
    });

    const groups = await listRecentGroups();
    expect(groups.map((g) => g.visibility)).toEqual(["private", "public"]);
    expect(groups[0]!.memberCount).toBe(4);
  });
});

describe("the overview numbers", () => {
  it("reads the daily view", async () => {
    client({
      tables: {
        admin_daily_counts: { data: [{ day: "2026-09-01", signups: 3, posts: 8, replies: 20 }], error: null },
      },
    });

    expect(await getDailyCounts()).toEqual([{ day: "2026-09-01", signups: 3, posts: 8, replies: 20 }]);
  });

  it("falls back to zeroes rather than rendering undefined everywhere", async () => {
    client({ tables: { admin_totals: { data: null, error: null } } });

    expect(await getTotals()).toEqual({
      profiles: 0,
      posts: 0,
      replies: 0,
      groups: 0,
      banned: 0,
      hidden_posts: 0,
      hidden_replies: 0,
      reported_items: 0,
    });
  });
});
