import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";
import { encodeCursor } from "@/lib/cursor";

const holder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => holder.client,
}));

const { getPost, getPostRaw, listPosts, listSyndicatedPosts, PAGE_SIZE } = await import(
  "@/lib/queries/posts"
);
const { listReplies, listRepliesByAuthor } = await import("@/lib/queries/replies");
const { getGroupBySlug, isMember, listDiscoverableGroups, listInvites, listMyGroups } = await import(
  "@/lib/queries/groups"
);
const { avatarUrl, getProfileByUsername } = await import("@/lib/queries/profiles");

const author = { username: "mara", display_name: "Mara", avatar_path: null };

function postRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    author_id: "aaaa",
    group_id: null,
    topic: "map",
    kind: "question",
    title: "A title that must not leak",
    body: "A body that must not leak.",
    spoiler_level: 0,
    vote_count: 2,
    reply_count: 1,
    accepted_reply_id: null,
    is_hidden: false,
    created_at: "2026-06-01T12:00:00.000Z",
    author: [author],
    group: null,
    ...overrides,
  };
}

function replyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    post_id: "11111111-1111-4111-8111-111111111111",
    author_id: "bbbb",
    body: "A reply body.",
    spoiler_level: 0,
    vote_count: 0,
    is_hidden: false,
    created_at: "2026-06-01T12:00:00.000Z",
    author: [author],
    ...overrides,
  };
}

describe("listPosts", () => {
  beforeEach(() => {
    holder.client = createFakeClient();
  });

  it("gates every row it returns", async () => {
    holder.client = createFakeClient({
      tables: {
        posts: {
          data: [postRow(), postRow({ id: "b", spoiler_level: 5 })],
          error: null,
        },
      },
    });

    const page = await listPosts({}, 0);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.hidden).toBe(false);
    expect(page.items[1]!.hidden).toBe(true);
    expect(JSON.stringify(page.items[1])).toContain("A title that must not leak");
    expect(JSON.stringify(page.items[1])).not.toContain("A body that must not leak");
  });

  it("flattens the embedded author and group rows", async () => {
    holder.client = createFakeClient({
      tables: {
        posts: { data: [postRow({ group: [{ slug: "vice", name: "Vice", visibility: "public" }] })], error: null },
      },
    });

    const page = await listPosts({}, 7);
    expect(page.items[0]).toMatchObject({ author: { username: "mara" }, group: { slug: "vice" } });
  });

  it("returns a cursor only when the page is full", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, index) => postRow({ id: `id-${index}` }));
    holder.client = createFakeClient({ tables: { posts: { data: full, error: null } } });
    const page = await listPosts({}, 7);
    expect(page.nextCursor).not.toBeNull();

    holder.client = createFakeClient({ tables: { posts: { data: [postRow()], error: null } } });
    expect((await listPosts({}, 7)).nextCursor).toBeNull();
  });

  it("applies a decoded cursor as a keyset filter", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: [], error: null } } });
    const cursor = encodeCursor({ createdAt: "2026-06-01T12:00:00.000Z", id: "abc" });
    await listPosts({ cursor }, 0);

    const or = holder.client.calls.find((call) => call.method === "or");
    expect(String(or?.args[0])).toContain("created_at.lt.2026-06-01T12:00:00.000Z");
  });

  it("ignores a malformed cursor rather than failing", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: [], error: null } } });
    await listPosts({ cursor: "not-a-cursor" }, 0);
    expect(holder.client.calls.some((call) => call.method === "or")).toBe(false);
  });

  it("uses offset paging for the top tab and returns no cursor", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, index) => postRow({ id: `id-${index}` }));
    holder.client = createFakeClient({ tables: { posts: { data: full, error: null } } });

    const page = await listPosts({ tab: "top", page: 1 }, 7);
    expect(page.nextCursor).toBeNull();
    expect(page.nextPage).toBe(2);
    expect(holder.client.calls.some((call) => call.method === "range")).toBe(true);
  });

  it("filters unanswered questions", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: [], error: null } } });
    await listPosts({ tab: "unanswered" }, 0);

    const eqCalls = holder.client.calls.filter((call) => call.method === "eq");
    expect(eqCalls.some((call) => call.args[0] === "kind" && call.args[1] === "question")).toBe(true);
    expect(holder.client.calls.some((call) => call.method === "is")).toBe(true);
  });

  it("routes a search through the ranked function and gates the result", async () => {
    holder.client = createFakeClient({
      rpc: { search_posts: { data: [postRow({ spoiler_level: 6 })], error: null } },
    });

    const page = await listPosts({ search: "airboat" }, 0);
    expect(page.items[0]!.hidden).toBe(true);
    expect(holder.client.calls[0]).toMatchObject({ method: "rpc", args: ["search_posts", expect.anything()] });
  });

  it("returns an empty page when the query errors", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: null, error: { message: "boom" } } } });
    expect(await listPosts({}, 0)).toEqual({ items: [], nextCursor: null, nextPage: null });

    holder.client = createFakeClient({ rpc: { search_posts: { data: null, error: { message: "boom" } } } });
    expect(await listPosts({ search: "x" }, 0)).toEqual({ items: [], nextCursor: null, nextPage: null });

    holder.client = createFakeClient({ tables: { posts: { data: null, error: { message: "boom" } } } });
    expect(await listPosts({ tab: "top" }, 0)).toEqual({ items: [], nextCursor: null, nextPage: null });
  });
});

describe("getPost", () => {
  it("gates the single row and returns null when it is missing", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: postRow({ spoiler_level: 3 }), error: null } } });
    const gated = await getPost("id", 1);
    expect(gated?.hidden).toBe(true);
    expect(Object.keys(gated!)).not.toContain("body");

    holder.client = createFakeClient({ tables: { posts: { data: null, error: null } } });
    expect(await getPost("id", 7)).toBeNull();
  });

  it("returns the raw row for the owner paths that ask for it", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: postRow({ spoiler_level: 7 }), error: null } } });
    expect((await getPostRaw("id"))?.title).toBe("A title that must not leak");

    holder.client = createFakeClient({ tables: { posts: { data: null, error: { message: "no" } } } });
    expect(await getPostRaw("id")).toBeNull();
  });
});

describe("replies", () => {
  it("gates each reply on its own level", async () => {
    holder.client = createFakeClient({
      tables: {
        replies: { data: [replyRow(), replyRow({ id: "hidden", spoiler_level: 4 })], error: null },
      },
    });

    const replies = await listReplies("post", 1, null);
    expect(replies.map((reply) => reply.hidden)).toEqual([false, true]);
  });

  it("floats the accepted reply to the top", async () => {
    holder.client = createFakeClient({
      tables: {
        replies: { data: [replyRow({ id: "first" }), replyRow({ id: "accepted" })], error: null },
      },
    });

    const replies = await listReplies("post", 7, "accepted");
    expect(replies[0]!.id).toBe("accepted");
  });

  it("returns an empty list on error", async () => {
    holder.client = createFakeClient({ tables: { replies: { data: null, error: { message: "no" } } } });
    expect(await listReplies("post", 7, null)).toEqual([]);
    expect(await listRepliesByAuthor("author", 7)).toEqual([]);
  });

  it("carries no parent post body inside a gated reply", async () => {
    holder.client = createFakeClient({
      tables: {
        replies: {
          data: [
            {
              ...replyRow({ spoiler_level: 7 }),
              post: [{ id: "p1", title: "A late game headline", body: "The late game body." }],
            },
          ],
          error: null,
        },
      },
    });

    const replies = await listRepliesByAuthor("author", 0);
    expect(replies[0]!.hidden).toBe(true);
    expect(JSON.stringify(replies)).not.toContain("The late game body");

    const select = holder.client.calls.find((call) => call.method === "select");
    expect(String(select?.args[0])).not.toContain("posts");
  });

  it("gates a profile's replies too", async () => {
    holder.client = createFakeClient({
      tables: { replies: { data: [replyRow({ spoiler_level: 2 })], error: null } },
    });
    const replies = await listRepliesByAuthor("author", 0);
    expect(replies[0]!.hidden).toBe(true);
  });
});

describe("groups", () => {
  const group = {
    id: "g1",
    slug: "vice-city-locals",
    name: "Vice City locals",
    description: null,
    visibility: "public",
    owner_id: "aaaa",
    member_count: 3,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("reads a group by slug and returns null when it is not visible", async () => {
    holder.client = createFakeClient({ tables: { groups: { data: group, error: null } } });
    expect((await getGroupBySlug("vice-city-locals"))?.name).toBe("Vice City locals");

    holder.client = createFakeClient({ tables: { groups: { data: null, error: null } } });
    expect(await getGroupBySlug("night-shift")).toBeNull();
  });

  it("lists discoverable groups and falls back to an empty list", async () => {
    holder.client = createFakeClient({ tables: { groups: { data: [group], error: null } } });
    expect(await listDiscoverableGroups()).toHaveLength(1);

    holder.client = createFakeClient({ tables: { groups: { data: null, error: null } } });
    expect(await listDiscoverableGroups()).toEqual([]);
  });

  it("flattens and sorts the viewer's memberships", async () => {
    holder.client = createFakeClient({
      tables: {
        group_members: {
          data: [{ group: [{ ...group, name: "Zulu" }] }, { group: { ...group, id: "g2", name: "Alpha" } }, { group: null }],
          error: null,
        },
      },
    });

    const mine = await listMyGroups("user");
    expect(mine.map((row) => row.name)).toEqual(["Alpha", "Zulu"]);
  });

  it("answers membership without a user id", async () => {
    holder.client = createFakeClient({ tables: { group_members: { data: { user_id: "u" }, error: null } } });
    expect(await isMember("g1", null)).toBe(false);
    expect(await isMember("g1", "u")).toBe(true);

    holder.client = createFakeClient({ tables: { group_members: { data: null, error: null } } });
    expect(await isMember("g1", "u")).toBe(false);
  });

  it("lists invites and falls back to an empty list", async () => {
    holder.client = createFakeClient({ tables: { group_invites: { data: [{ id: "i", code: "ABC" }], error: null } } });
    expect(await listInvites("g1")).toHaveLength(1);

    holder.client = createFakeClient({ tables: { group_invites: { data: null, error: null } } });
    expect(await listInvites("g1")).toEqual([]);
  });
});

describe("profiles", () => {
  it("reads a profile by username", async () => {
    holder.client = createFakeClient({ tables: { profiles: { data: { username: "mara" }, error: null } } });
    expect((await getProfileByUsername("mara"))?.username).toBe("mara");

    holder.client = createFakeClient({ tables: { profiles: { data: null, error: null } } });
    expect(await getProfileByUsername("nobody")).toBeNull();
  });

  it("builds an avatar url only when there is a path", async () => {
    holder.client = createFakeClient({ storage: { publicUrl: "https://cdn.test/a.png" } });
    expect(await avatarUrl(null)).toBeNull();
    expect(await avatarUrl(undefined)).toBeNull();
    expect(await avatarUrl("user/a.png")).toBe("https://cdn.test/a.png");
  });
});

describe("getViewer", () => {
  it("returns null when nobody is signed in", async () => {
    const authClient = { ...createFakeClient(), auth: { getUser: async () => ({ data: { user: null } }) } };
    holder.client = authClient as unknown as FakeClient;

    const { getViewer } = await import("@/lib/viewer");
    expect(await getViewer()).toBeNull();
  });
});

describe("listSyndicatedPosts", () => {
  it("returns a title, a link id, an author, and a date, and nothing else", async () => {
    holder.client = createFakeClient({
      tables: {
        posts: {
          data: [
            {
              id: "post-1",
              title: "How big is Leonida",
              created_at: "2026-06-01T12:00:00.000Z",
              author: [author],
              group: null,
            },
          ],
          error: null,
        },
      },
    });

    const items = await listSyndicatedPosts();

    expect(items).toEqual([
      { id: "post-1", title: "How big is Leonida", author: "Mara", createdAt: "2026-06-01T12:00:00.000Z" },
    ]);
    // No body was selected, so there is nothing for a feed reader to leak.
    expect(Object.keys(items[0] ?? {})).toEqual(["id", "title", "author", "createdAt"]);
  });

  it("filters to level 0 and drops posts inside a private group", async () => {
    holder.client = createFakeClient({
      tables: {
        posts: {
          data: [
            { id: "a", title: "Public", created_at: "2026-06-01T12:00:00.000Z", author: [author], group: null },
            {
              id: "b",
              title: "Inside a private room",
              created_at: "2026-06-01T12:00:00.000Z",
              author: [author],
              group: [{ visibility: "private" }],
            },
          ],
          error: null,
        },
      },
    });

    const items = await listSyndicatedPosts();

    expect(items.map((item) => item.id)).toEqual(["a"]);
    expect(holder.client.calls).toContainEqual({ method: "eq", args: ["spoiler_level", 0] });
    expect(holder.client.calls).toContainEqual({ method: "eq", args: ["is_hidden", false] });
  });

  it("scopes to one group when given one, and to the main feed when not", async () => {
    holder.client = createFakeClient();
    await listSyndicatedPosts("group-1");
    expect(holder.client.calls).toContainEqual({ method: "eq", args: ["group_id", "group-1"] });

    holder.client = createFakeClient();
    await listSyndicatedPosts();
    expect(holder.client.calls).toContainEqual({ method: "is", args: ["group_id", null] });
  });

  it("names an author with no display name by their username", async () => {
    holder.client = createFakeClient({
      tables: {
        posts: {
          data: [
            {
              id: "a",
              title: "t",
              created_at: "2026-06-01T12:00:00.000Z",
              author: [{ username: "mona", display_name: null }],
              group: null,
            },
          ],
          error: null,
        },
      },
    });

    expect((await listSyndicatedPosts())[0]?.author).toBe("mona");
  });

  it("returns nothing when the query errors", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: null, error: { message: "nope" } } } });
    expect(await listSyndicatedPosts()).toEqual([]);
  });
});
