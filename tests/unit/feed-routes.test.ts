import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";

const holder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => holder.client,
}));

const { GET: siteFeed } = await import("@/app/feed.xml/route");
const { GET: groupFeed } = await import("@/app/(app)/g/[slug]/feed.xml/route");

const POST_ROW = {
  short_id: "k3m91xqz",
  slug: "how-big-is-leonida",
  kind: "question",
  title: "How big is Leonida",
  created_at: "2026-02-01T10:00:00.000Z",
  author: [{ username: "vic", display_name: "Vic" }],
  group: null,
};

const GROUP = {
  id: "group-1",
  slug: "map-nerds",
  name: "Map nerds",
  description: "Coastline and causeways.",
  visibility: "public",
  owner_id: "u1",
  member_count: 4,
  created_at: "2026-01-05T00:00:00.000Z",
};

function withRows(group: unknown = null) {
  holder.client = createFakeClient({
    tables: {
      posts: { data: [POST_ROW], error: null },
      groups: { data: group, error: null },
    },
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://askgta6.test";
  process.env.NEXT_PUBLIC_INDEXING = "on";
  withRows();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_INDEXING = "off";
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("/feed.xml", () => {
  it("lists the latest level 0 posts", async () => {
    const xml = await (await siteFeed()).text();

    expect(xml).toContain("<title>How big is Leonida</title>");
    expect(xml).toContain("<link>https://askgta6.test/ask/k3m91xqz/how-big-is-leonida</link>");
    expect(xml).toContain("<dc:creator>Vic</dc:creator>");
  });

  it("is empty while indexing is off, the way the sitemap is", async () => {
    process.env.NEXT_PUBLIC_INDEXING = "off";
    const response = await siteFeed();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
    // The database was never asked, because the answer could not be used.
    expect(holder.client.calls).toHaveLength(0);
  });
});

describe("/g/[slug]/feed.xml", () => {
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

  it("serves a public group's posts", async () => {
    withRows(GROUP);
    const xml = await (await groupFeed(new Request("https://askgta6.test"), params("map-nerds"))).text();

    expect(xml).toContain("<title>Map nerds, AskGTA6</title>");
    expect(xml).toContain("<link>https://askgta6.test/g/map-nerds</link>");
    expect(xml).toContain("<title>How big is Leonida</title>");
  });

  it("404s for a private group and for one that does not exist", async () => {
    withRows({ ...GROUP, visibility: "private" });
    expect((await groupFeed(new Request("https://x.test"), params("inner"))).status).toBe(404);

    withRows(null);
    expect((await groupFeed(new Request("https://x.test"), params("nope"))).status).toBe(404);
  });

  it("is empty while indexing is off", async () => {
    process.env.NEXT_PUBLIC_INDEXING = "off";
    withRows(GROUP);
    const xml = await (await groupFeed(new Request("https://x.test"), params("map-nerds"))).text();

    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});
