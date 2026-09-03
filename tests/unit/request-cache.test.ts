import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * React's cache() only dedupes inside the RSC renderer, which vitest cannot host.
 * So the request scope is supplied here instead: one memo per module registry, torn
 * down by resetModules between tests. In production React supplies the same scope
 * per request. What this file guards is the shape the code has to keep for that to
 * work: one client construction, one auth.getUser, one profiles read for a whole
 * page tree, however many call sites ask.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      return (...args: A): R => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key) as R;
      };
    },
  };
});

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const counts = { createClient: 0, getUser: 0, profileReads: 0 };

const PROFILE = {
  id: "user-1",
  username: "vic",
  display_name: "Vic",
  avatar_path: null,
  progress: 3,
  spoiler_shield: true,
  theme: "dark",
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    counts.createClient += 1;
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: () => builder,
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: PROFILE, error: null }).then(resolve),
    };
    return {
      auth: {
        getUser: async () => {
          counts.getUser += 1;
          return { data: { user: { id: "user-1" } }, error: null };
        },
      },
      from: (table: string) => {
        if (table === "profiles") counts.profileReads += 1;
        return builder;
      },
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  cookieJar.clear();
  counts.createClient = 0;
  counts.getUser = 0;
  counts.profileReads = 0;
});

/**
 * The calls a signed in reader's post page makes, in the order the tree makes them:
 * the layout resolves the viewer and the shield, then the page resolves the viewer,
 * the gate level and the shield again, then five leaf components each ask for the
 * viewer to decide whether to render an author control.
 */
async function renderPageTree() {
  const { getShieldState, getViewer, getViewerProgress } = await import("@/lib/viewer");

  // Layout.
  await getViewer();
  await getShieldState();

  // Page.
  await getViewer();
  await getViewerProgress();
  await getShieldState();

  // Leaves.
  await Promise.all(Array.from({ length: 5 }, () => getViewer()));

  return getViewer();
}

describe("viewer lookup is once per request", () => {
  it("resolves the user once across a whole page tree", async () => {
    const viewer = await renderPageTree();

    expect(viewer?.username).toBe("vic");
    expect(counts.getUser).toBe(1);
    expect(counts.profileReads).toBe(1);
  });

  it("builds the Supabase client once across a whole page tree", async () => {
    await renderPageTree();

    expect(counts.createClient).toBe(1);
  });

  it("shares that one client with every other module that asks for it", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");

    await renderPageTree();
    const [a, b] = await Promise.all([createSupabaseServerClient(), createSupabaseServerClient()]);

    expect(a).toBe(b);
    expect(counts.createClient).toBe(1);
  });

  it("routes the shield readers through the one viewer lookup", async () => {
    const { getShieldState, getViewerProgress } = await import("@/lib/viewer");

    await getShieldState();
    await getViewerProgress();
    await getShieldState();

    expect(counts.getUser).toBe(1);
  });

  it("keeps auth.getUser to the one call site the cache covers", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const roots = ["app", "actions", "components", "lib"];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(full)) files.push(full);
      }
    };
    roots.forEach(walk);

    const callers = files.filter((file) => /auth\.(getUser|getSession)\(/.test(readFileSync(file, "utf8")));

    // lib/viewer.ts is the cached one. lib/supabase/middleware.ts runs in its own
    // request context, before any cache scope exists, and has to refresh there.
    expect(callers.sort()).toEqual(["lib/supabase/middleware.ts", "lib/viewer.ts"]);
  });
});
