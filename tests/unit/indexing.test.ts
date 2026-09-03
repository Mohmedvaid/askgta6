import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";

const holder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => holder.client,
}));

vi.mock("@/lib/viewer", () => ({
  getViewer: async () => null,
  getViewerProgress: async () => 0,
}));

// next/font needs the Next build plugin, and these pages only import it for a class name.
vi.mock("@/lib/theme/fonts", () => ({ fontVariables: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

const {
  INDEX,
  NEVER_INDEXED_SOURCES,
  NOINDEX,
  feedIsIndexable,
  groupIsIndexable,
  indexingEnabled,
  isPermanentlyNoindex,
  postIsIndexable,
  profileIsIndexable,
  robotsFor,
} = await import("@/lib/indexing");

const { generateMetadata: postMetadata } = await import("@/app/(app)/p/[postId]/page");
const { generateMetadata: groupMetadata } = await import("@/app/(app)/g/[slug]/page");
const { generateMetadata: profileMetadata } = await import("@/app/(app)/u/[username]/page");
const { generateMetadata: feedMetadata } = await import("@/app/(app)/feed/page");

const { metadata: rootMetadata } = await import("@/app/layout");
const { metadata: authMetadata } = await import("@/app/auth/layout");
const { metadata: settingsMetadata } = await import("@/app/(app)/settings/page");
const { metadata: newPostMetadata } = await import("@/app/(app)/new/page");
const { metadata: newGroupMetadata } = await import("@/app/(app)/g/new/page");
const { metadata: newGroupPostMetadata } = await import("@/app/(app)/g/[slug]/new/page");
const { metadata: joinMetadata } = await import("@/app/(app)/g/join/[code]/page");
const { metadata: onboardingMetadata } = await import("@/app/(app)/onboarding/page");
const { metadata: adminMetadata } = await import("@/app/(app)/admin/reports/page");
const { metadata: editMetadata } = await import("@/app/(app)/p/[postId]/edit/page");

const robotsModule = await import("@/app/robots");
const sitemapModule = await import("@/app/sitemap");

const UUID = "8b2f0f7a-1111-4222-8333-444455556666";
const original = process.env.NEXT_PUBLIC_INDEXING;

const author = { username: "mara", display_name: "Mara", avatar_path: null };

function postRow(spoilerLevel: number) {
  return {
    id: UUID,
    author_id: "aaaa",
    group_id: null,
    topic: "map",
    kind: "question",
    title: "How big is the Leonida map",
    body: "Trailer two shows a lot of coastline.",
    spoiler_level: spoilerLevel,
    vote_count: 0,
    reply_count: 0,
    accepted_reply_id: null,
    is_hidden: false,
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    author: [author],
    group: null,
  };
}

function setFlag(value: "on" | "off") {
  process.env.NEXT_PUBLIC_INDEXING = value;
}

/** Reads the robots directive out of a Metadata object. */
function robotsOf(metadata: { robots?: unknown }) {
  return metadata.robots as { index: boolean; follow: boolean } | undefined;
}

beforeEach(() => {
  holder.client = createFakeClient();
});

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_INDEXING;
  else process.env.NEXT_PUBLIC_INDEXING = original;
});

describe("the flag", () => {
  it("is off unless it says exactly on", () => {
    setFlag("off");
    expect(indexingEnabled()).toBe(false);

    delete process.env.NEXT_PUBLIC_INDEXING;
    expect(indexingEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_INDEXING = "true";
    expect(indexingEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_INDEXING = "ON";
    expect(indexingEnabled()).toBe(false);

    setFlag("on");
    expect(indexingEnabled()).toBe(true);
  });

  it("spells both directives out for the crawler", () => {
    expect(NOINDEX).toMatchObject({ index: false, follow: false });
    expect(INDEX).toMatchObject({ index: true, follow: true });
  });
});

describe("robotsFor", () => {
  it("is noindex nofollow for everything while the flag is off", () => {
    setFlag("off");
    expect(robotsOf({ robots: robotsFor(true) })).toMatchObject({ index: false, follow: false });
    expect(robotsOf({ robots: robotsFor(false) })).toMatchObject({ index: false, follow: false });
  });

  it("lets an indexable page through once the flag is on, and nothing else", () => {
    setFlag("on");
    expect(robotsOf({ robots: robotsFor(true) })).toMatchObject({ index: true, follow: true });
    expect(robotsOf({ robots: robotsFor(false) })).toMatchObject({ index: false, follow: false });
  });
});

describe("page metadata with the flag off and on", () => {
  it("makes the landing page indexable only when the flag is on", async () => {
    setFlag("off");
    vi.resetModules();
    let landing = await import("@/app/(marketing)/page");
    expect(robotsOf(landing.metadata)).toMatchObject({ index: false, follow: false });

    setFlag("on");
    vi.resetModules();
    landing = await import("@/app/(marketing)/page");
    expect(robotsOf(landing.metadata)).toMatchObject({ index: true, follow: true });
  });

  it("makes the feed indexable only when the flag is on", async () => {
    const params = { searchParams: Promise.resolve({}) };

    setFlag("off");
    expect(robotsOf(await feedMetadata(params))).toMatchObject({ index: false, follow: false });

    setFlag("on");
    expect(robotsOf(await feedMetadata({ searchParams: Promise.resolve({}) }))).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("keeps a search result page out of the index even with the flag on", async () => {
    setFlag("on");
    const withQuery = { searchParams: Promise.resolve({ q: "airboat" }) };
    expect(robotsOf(await feedMetadata(withQuery))).toMatchObject({ index: false, follow: false });
  });

  it("makes a public post indexable only when the flag is on", async () => {
    const params = { params: Promise.resolve({ postId: UUID }) };
    holder.client = createFakeClient({ tables: { posts: { data: postRow(0), error: null } } });

    setFlag("off");
    expect(robotsOf(await postMetadata(params))).toMatchObject({ index: false, follow: false });

    setFlag("on");
    holder.client = createFakeClient({ tables: { posts: { data: postRow(0), error: null } } });
    expect(robotsOf(await postMetadata({ params: Promise.resolve({ postId: UUID }) }))).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("makes a public group indexable only when the flag is on", async () => {
    const publicGroup = { id: "g1", slug: "vice", name: "Vice City locals", visibility: "public" };
    holder.client = createFakeClient({ tables: { groups: { data: publicGroup, error: null } } });

    setFlag("off");
    expect(robotsOf(await groupMetadata({ params: Promise.resolve({ slug: "vice" }) }))).toMatchObject({
      index: false,
      follow: false,
    });

    setFlag("on");
    holder.client = createFakeClient({ tables: { groups: { data: publicGroup, error: null } } });
    expect(robotsOf(await groupMetadata({ params: Promise.resolve({ slug: "vice" }) }))).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("makes a profile indexable only when the flag is on, even with every body sealed", async () => {
    const withPosts = () =>
      createFakeClient({
        tables: {
          profiles: { data: { id: "u1", username: "mara" }, error: null },
          posts: { data: [postRow(7)], error: null },
        },
      });

    setFlag("off");
    holder.client = withPosts();
    expect(robotsOf(await profileMetadata({ params: Promise.resolve({ username: "mara" }) }))).toMatchObject({
      index: false,
      follow: false,
    });

    setFlag("on");
    holder.client = withPosts();
    expect(robotsOf(await profileMetadata({ params: Promise.resolve({ username: "mara" }) }))).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("disallows everything in robots.txt while off, and opens up when on", async () => {
    setFlag("off");
    expect(robotsModule.default()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });

    setFlag("on");
    const opened = robotsModule.default();
    expect(opened.rules).toMatchObject([{ userAgent: "*", allow: "/" }]);
    expect(opened.sitemap).toBeDefined();
  });

  it("returns an empty sitemap while off and real urls when on", async () => {
    setFlag("off");
    expect(await sitemapModule.default()).toEqual([]);

    setFlag("on");
    holder.client = createFakeClient({
      tables: {
        posts: { data: [{ id: UUID, updated_at: "2026-06-01T12:00:00.000Z", group: null }], error: null },
        groups: { data: [{ slug: "vice", created_at: "2026-01-01T00:00:00.000Z" }], error: null },
      },
    });

    const entries = await sitemapModule.default();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("http://localhost:3000/feed");
    expect(urls).toContain("http://localhost:3000/g/vice");
    expect(urls).toContain(`http://localhost:3000/p/${UUID}`);
  });

  it("keeps private group posts out of the sitemap", async () => {
    setFlag("on");
    holder.client = createFakeClient({
      tables: {
        posts: {
          data: [
            { id: "public-post", updated_at: "2026-06-01T12:00:00.000Z", group: null },
            { id: "private-post", updated_at: "2026-06-01T12:00:00.000Z", group: [{ visibility: "private" }] },
          ],
          error: null,
        },
        groups: { data: [], error: null },
      },
    });

    const urls = (await sitemapModule.default()).map((entry) => entry.url);
    expect(urls).toContain("http://localhost:3000/p/public-post");
    expect(urls).not.toContain("http://localhost:3000/p/private-post");
  });
});

describe("the permanent noindex list, whatever the flag says", () => {
  const staticPages: [string, { robots?: unknown }][] = [
    ["root default", rootMetadata],
    ["/auth/*", authMetadata],
    ["/settings", settingsMetadata],
    ["/new", newPostMetadata],
    ["/g/new", newGroupMetadata],
    ["/g/[slug]/new", newGroupPostMetadata],
    ["/g/join/[code]", joinMetadata],
    ["/onboarding", onboardingMetadata],
    ["/admin/reports", adminMetadata],
    ["/p/[postId]/edit", editMetadata],
  ];

  it.each(staticPages)("%s is noindex nofollow with the flag off", (_name, metadata) => {
    setFlag("off");
    expect(robotsOf(metadata)).toMatchObject({ index: false, follow: false });
  });

  it.each(staticPages)("%s is still noindex nofollow with the flag on", (_name, metadata) => {
    setFlag("on");
    expect(robotsOf(metadata)).toMatchObject({ index: false, follow: false });
  });

  it.each([
    "/auth/sign-in",
    "/auth/callback",
    "/settings",
    "/admin/reports",
    "/new",
    "/g/new",
    "/g/vice-city-locals/new",
    "/g/join/NIGHTRUN",
    "/onboarding",
  ])("recognizes %s as permanently out of the index", (pathname) => {
    setFlag("on");
    expect(isPermanentlyNoindex(pathname)).toBe(true);
  });

  it.each(["/", "/feed", "/g", "/g/vice-city-locals", "/p/abc", "/u/mara"])(
    "does not put %s on the permanent list",
    (pathname) => {
      expect(isPermanentlyNoindex(pathname)).toBe(false);
    },
  );

  it("sends the same list to next.config as header sources", () => {
    for (const source of NEVER_INDEXED_SOURCES) {
      const sample = source.replace(":path*", "x").replace(":slug", "x").replace(":code", "x").replace(/\/$/, "");
      expect(isPermanentlyNoindex(sample)).toBe(true);
    }
  });

  it("indexes a post gated above level 0 once the flag is on, because its title is public", async () => {
    setFlag("off");
    holder.client = createFakeClient({ tables: { posts: { data: postRow(6), error: null } } });
    expect(robotsOf(await postMetadata({ params: Promise.resolve({ postId: UUID }) }))).toMatchObject({
      index: false,
      follow: false,
    });

    setFlag("on");
    holder.client = createFakeClient({ tables: { posts: { data: postRow(6), error: null } } });
    expect(robotsOf(await postMetadata({ params: Promise.resolve({ postId: UUID }) }))).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("never indexes a post inside a private group, whatever the flag says", async () => {
    for (const flag of ["off", "on"] as const) {
      setFlag(flag);
      holder.client = createFakeClient({
        tables: {
          posts: {
            data: { ...postRow(0), group: [{ slug: "night-shift", name: "Night shift", visibility: "private" }] },
            error: null,
          },
        },
      });
      const metadata = await postMetadata({ params: Promise.resolve({ postId: UUID }) });
      expect(robotsOf(metadata), `flag ${flag}`).toMatchObject({ index: false, follow: false });
    }
  });

  it("never indexes a moderation hidden post, whatever the flag says", async () => {
    for (const flag of ["off", "on"] as const) {
      setFlag(flag);
      holder.client = createFakeClient({
        tables: { posts: { data: { ...postRow(0), is_hidden: true }, error: null } },
      });
      const metadata = await postMetadata({ params: Promise.resolve({ postId: UUID }) });
      expect(robotsOf(metadata), `flag ${flag}`).toMatchObject({ index: false, follow: false });
    }
  });

  it("never indexes a missing post", async () => {
    setFlag("on");
    holder.client = createFakeClient({ tables: { posts: { data: null, error: null } } });
    expect(robotsOf(await postMetadata({ params: Promise.resolve({ postId: UUID }) }))).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("never indexes a private group page, whatever the flag says", async () => {
    for (const flag of ["off", "on"] as const) {
      setFlag(flag);
      holder.client = createFakeClient({
        tables: { groups: { data: { slug: "night-shift", visibility: "private" }, error: null } },
      });
      const metadata = await groupMetadata({ params: Promise.resolve({ slug: "night-shift" }) });
      expect(robotsOf(metadata), `flag ${flag}`).toMatchObject({ index: false, follow: false });
    }
  });

  it("never indexes a group the viewer cannot even see", async () => {
    setFlag("on");
    holder.client = createFakeClient({ tables: { groups: { data: null, error: null } } });
    expect(robotsOf(await groupMetadata({ params: Promise.resolve({ slug: "night-shift" }) }))).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("never indexes a profile that does not exist", async () => {
    setFlag("on");
    holder.client = createFakeClient({ tables: { profiles: { data: null, error: null } } });
    expect(robotsOf(await profileMetadata({ params: Promise.resolve({ username: "ghost" }) }))).toMatchObject({
      index: false,
      follow: false,
    });
  });
});

describe("the indexability rules themselves", () => {
  it("lets every public post through whatever its level, and nothing else", () => {
    expect(postIsIndexable({})).toBe(true);
    expect(postIsIndexable({ group: null })).toBe(true);
    expect(postIsIndexable({ group: { visibility: "public" } })).toBe(true);
    expect(postIsIndexable({ group: { visibility: "private" } })).toBe(false);
    expect(postIsIndexable({ is_hidden: true })).toBe(false);
    expect(postIsIndexable(null)).toBe(false);
  });

  it("only lets a public group through", () => {
    expect(groupIsIndexable({ visibility: "public" })).toBe(true);
    expect(groupIsIndexable({ visibility: "private" })).toBe(false);
    expect(groupIsIndexable(null)).toBe(false);
  });

  it("lets every real profile through", () => {
    expect(profileIsIndexable(true)).toBe(true);
    expect(profileIsIndexable(false)).toBe(false);
  });

  it("keeps arbitrary search queries out of the feed's index permission", () => {
    expect(feedIsIndexable(null)).toBe(true);
    expect(feedIsIndexable(undefined)).toBe(true);
    expect(feedIsIndexable("")).toBe(true);
    expect(feedIsIndexable("airboat")).toBe(false);
  });
});

describe("robots.txt disallow list", () => {
  it("turns path params into crawler wildcards, never an empty segment", () => {
    process.env.NEXT_PUBLIC_INDEXING = "on";
    const rule = robotsModule.default().rules;
    const disallow = (Array.isArray(rule) ? rule[0] : rule)?.disallow as string[];

    expect(disallow).toContain("/g/*/new");
    expect(disallow).toContain("/auth/*");
    expect(disallow).toContain("/onboarding");
    expect(disallow.some((path) => path.includes("//"))).toBe(false);
  });
});
