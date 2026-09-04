import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeClient, type FakeClient } from "./fake-supabase";

/**
 * The post URL layer: what the path is, and what happens when it is wrong.
 *
 * A post is resolved by its short id, so the slug and the prefix are decoration.
 * Getting either one wrong has to cost a redirect and never a 404, or every link
 * shared before a title was edited breaks. These tests are that promise written
 * down: the matrix of prefix and slug against what the route does with it.
 */

const holder: { client: FakeClient } = { client: createFakeClient() };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => holder.client,
}));

const viewer: { current: { userId: string } | null } = { current: null };

vi.mock("@/lib/viewer", () => ({
  getViewer: async () => viewer.current,
  getViewerProgress: async () => 0,
  getShieldState: async () => ({ enabled: false, progress: 0 }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`PERMANENT:${url}`);
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { isPostPrefix, kindForPrefix, legacyPostPath, postPath, prefixForKind, safePostPath } = await import(
  "@/lib/post-url"
);
const { default: PostPage, generateMetadata: postMetadata } = await import(
  "@/app/(app)/[prefix]/[shortId]/[slug]/page"
);
const { default: EditPage } = await import("@/app/(app)/[prefix]/[shortId]/[slug]/edit/page");
const { GET: legacyRoute } = await import("@/app/(app)/p/[postId]/route");

const SHORT_ID = "k3m91xqz";
const SLUG = "how-big-is-the-leonida-map";
const UUID = "8b2f0f7a-1111-4222-8333-444455556666";
const AUTHOR = { username: "mara", display_name: "Mara", avatar_path: null };

function postRow(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID,
    short_id: SHORT_ID,
    slug: SLUG,
    author_id: "aaaa",
    group_id: null,
    topic: "map",
    kind: "question",
    title: "How big is the Leonida map",
    body: "Trailer two shows a lot of coastline.",
    spoiler_level: 0,
    vote_count: 0,
    reply_count: 0,
    accepted_reply_id: null,
    is_hidden: false,
    created_at: "2026-06-01T12:00:00.000Z",
    author: [AUTHOR],
    group: null,
    ...overrides,
  };
}

function withPost(overrides: Record<string, unknown> = {}) {
  holder.client = createFakeClient({ tables: { posts: { data: postRow(overrides), error: null } } });
}

function params(prefix: string, slug: string, shortId = SHORT_ID) {
  return { params: Promise.resolve({ prefix, shortId, slug }) };
}

/** The outcome of asking a route for a path: rendered, redirected, or gone. */
async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "rendered";
  } catch (error) {
    return (error as Error).message;
  }
}

beforeEach(() => {
  viewer.current = null;
  withPost();
});

describe("the shape of a post url", () => {
  it("puts a question under /ask and a discussion under /talk", () => {
    expect(postPath({ kind: "question", short_id: SHORT_ID, slug: SLUG })).toBe(`/ask/${SHORT_ID}/${SLUG}`);
    expect(postPath({ kind: "discussion", short_id: SHORT_ID, slug: SLUG })).toBe(`/talk/${SHORT_ID}/${SLUG}`);
  });

  it("maps a prefix back to the kind it stands for, and only those two", () => {
    expect(kindForPrefix("ask")).toBe("question");
    expect(kindForPrefix("talk")).toBe("discussion");
    expect(prefixForKind("question")).toBe("ask");

    expect(isPostPrefix("ask")).toBe(true);
    expect(isPostPrefix("talk")).toBe(true);
    for (const other of ["p", "post", "g", "u", "topic", "", "ASK"]) {
      expect(isPostPrefix(other), other).toBe(false);
    }
  });

  it("keeps the legacy path for a post held only by uuid", () => {
    expect(legacyPostPath(UUID)).toBe(`/p/${UUID}`);
  });
});

describe("the path a form sends back for revalidation", () => {
  it("accepts a path this app could have produced", () => {
    expect(safePostPath(`/ask/${SHORT_ID}/${SLUG}`)).toBe(`/ask/${SHORT_ID}/${SLUG}`);
    expect(safePostPath("/talk/aaaaaaaa/x")).toBe("/talk/aaaaaaaa/x");
  });

  it("refuses everything else", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "",
      "/feed",
      `/p/${UUID}`,
      "//evil.test/ask/aaaaaaaa/x",
      "https://evil.test/ask/aaaaaaaa/x",
      "/ask/TOOSHORT/x",
      "/ask/aaaaaaaaa/x",
      `/ask/${SHORT_ID}/${"x".repeat(61)}`,
      "/ask/aaaaaaaa/x/../../admin",
    ]) {
      expect(safePostPath(bad), String(bad)).toBeNull();
    }
  });
});

describe("the redirect matrix", () => {
  it("renders the canonical path", async () => {
    expect(await outcome(() => PostPage(params("ask", SLUG)))).toBe("rendered");
  });

  it("sends a stale slug to the canonical path, permanently", async () => {
    expect(await outcome(() => PostPage(params("ask", "the-old-title")))).toBe(
      `PERMANENT:/ask/${SHORT_ID}/${SLUG}`,
    );
  });

  it("sends a missing slug segment to the canonical path", async () => {
    expect(await outcome(() => PostPage(params("ask", "")))).toBe(`PERMANENT:/ask/${SHORT_ID}/${SLUG}`);
  });

  it("sends the wrong prefix to the right one", async () => {
    expect(await outcome(() => PostPage(params("talk", SLUG)))).toBe(`PERMANENT:/ask/${SHORT_ID}/${SLUG}`);
  });

  it("fixes the prefix and the slug in one hop", async () => {
    expect(await outcome(() => PostPage(params("talk", "the-old-title")))).toBe(
      `PERMANENT:/ask/${SHORT_ID}/${SLUG}`,
    );
  });

  it("sends a discussion under /ask to /talk", async () => {
    withPost({ kind: "discussion" });
    expect(await outcome(() => PostPage(params("ask", SLUG)))).toBe(`PERMANENT:/talk/${SHORT_ID}/${SLUG}`);
  });

  it("404s a prefix that is neither, rather than redirecting somewhere", async () => {
    expect(await outcome(() => PostPage(params("posts", SLUG)))).toBe("NOT_FOUND");
  });

  it("404s a short id that resolves to nothing", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: null, error: null } } });
    expect(await outcome(() => PostPage(params("ask", SLUG, "zzzzzzzz")))).toBe("NOT_FOUND");
  });
});

describe("the same matrix on the edit page", () => {
  it("sends a signed out visitor to sign in before anything else", async () => {
    expect(await outcome(() => EditPage(params("ask", SLUG)))).toBe("REDIRECT:/auth/sign-in");
  });

  it("keeps the edit segment when it fixes a stale path", async () => {
    viewer.current = { userId: "aaaa" };
    expect(await outcome(() => EditPage(params("talk", "the-old-title")))).toBe(
      `PERMANENT:/ask/${SHORT_ID}/${SLUG}/edit`,
    );
  });

  it("sends somebody who is not the author back to the thread", async () => {
    viewer.current = { userId: "somebody-else" };
    expect(await outcome(() => EditPage(params("ask", SLUG)))).toBe(`REDIRECT:/ask/${SHORT_ID}/${SLUG}`);
  });

  it("404s an unknown prefix here too", async () => {
    viewer.current = { userId: "aaaa" };
    expect(await outcome(() => EditPage(params("posts", SLUG)))).toBe("NOT_FOUND");
  });
});

describe("the old /p/<uuid> url", () => {
  it("301s to the canonical path", async () => {
    holder.client = createFakeClient({
      tables: { posts: { data: { short_id: SHORT_ID, slug: SLUG, kind: "question" }, error: null } },
    });

    const response = await legacyRoute(new Request("http://localhost/p/x"), {
      params: Promise.resolve({ postId: UUID }),
    });

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`http://localhost/ask/${SHORT_ID}/${SLUG}`);
  });

  it("301s a discussion to /talk", async () => {
    holder.client = createFakeClient({
      tables: { posts: { data: { short_id: SHORT_ID, slug: SLUG, kind: "discussion" }, error: null } },
    });

    const response = await legacyRoute(new Request("http://localhost/p/x"), {
      params: Promise.resolve({ postId: UUID }),
    });

    expect(response.headers.get("location")).toBe(`http://localhost/talk/${SHORT_ID}/${SLUG}`);
  });

  it("404s rather than redirecting when the uuid resolves to nothing", async () => {
    holder.client = createFakeClient({ tables: { posts: { data: null, error: null } } });

    expect(
      await outcome(() =>
        legacyRoute(new Request("http://localhost/p/x"), { params: Promise.resolve({ postId: UUID }) }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("what the metadata says about a non canonical path", () => {
  it("points the canonical at the real path, not the one that was requested", async () => {
    const metadata = await postMetadata(params("talk", "the-old-title"));
    expect(metadata.alternates?.canonical).toBe(`/ask/${SHORT_ID}/${SLUG}`);
  });

  it("points the opengraph url at the canonical path and leaves the image to the file convention", async () => {
    const metadata = await postMetadata(params("ask", SLUG));

    expect(metadata.openGraph).toMatchObject({ url: `/ask/${SHORT_ID}/${SLUG}` });
    // Hand writing the path would miss the build hash Next puts on the image route.
    expect(metadata.openGraph).not.toHaveProperty("images");
  });

  it("says nothing about a prefix that is not a post prefix", async () => {
    expect(await postMetadata(params("posts", SLUG))).toMatchObject({ title: "Post not found" });
  });
});
