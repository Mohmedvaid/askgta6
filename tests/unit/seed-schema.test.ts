import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderSchemaDoc, validate } from "@/supabase/seed/schema";
import { ids, seededRandom, shuffled, uuidv5 } from "@/supabase/seed/ids";
import { buildVotes, voterPoolSize } from "@/supabase/seed/import";
import type { SeedFile } from "@/supabase/seed/types";

const GOOD: SeedFile = {
  accounts: [
    { username: "keysrunner", display_name: "Keys", bio: "Boat guy.", created_at: "2026-07-01T10:00:00Z" },
    { username: "mapnerd", display_name: null, bio: null, created_at: "2026-07-02T10:00:00Z" },
  ],
  posts: [
    {
      id: "p1",
      author: "keysrunner",
      group: null,
      topic: "map",
      kind: "question",
      title: "Where does the causeway end",
      body: "Asking for the map thread.",
      spoiler_level: 0,
      created_at: "2026-08-01T10:00:00Z",
      upvotes: 4,
      downvotes: 1,
      accepted_reply_id: "r1",
    },
  ],
  replies: [
    {
      id: "r1",
      post_id: "p1",
      author: "mapnerd",
      body: "It ends at the second marker.",
      spoiler_level: 0,
      created_at: "2026-08-01T11:00:00Z",
      upvotes: 2,
      downvotes: 0,
    },
  ],
};

const clone = (): SeedFile => JSON.parse(JSON.stringify(GOOD)) as SeedFile;
const paths = (file: SeedFile) => validate(file).map((violation) => violation.path);

describe("validate", () => {
  it("passes a good file", () => {
    expect(validate(GOOD)).toEqual([]);
  });

  it("passes the real seed.json that ships in the repo", () => {
    const real = JSON.parse(readFileSync(`${process.cwd()}/supabase/seed/seed.json`, "utf8")) as SeedFile;
    expect(validate(real)).toEqual([]);
  });

  it("reports every problem, not the first", () => {
    const file = clone();
    file.accounts[0]!.username = "NO";
    file.posts[0]!.topic = "nonsense";
    file.posts[0]!.title = "short";

    // Four lines: the three edits, plus the post whose author that rename orphaned.
    // Naming the knock on effect is the point of listing all of them.
    expect(paths(file)).toEqual([
      "accounts[0].username",
      "posts[0].author",
      "posts[0].topic",
      "posts[0].title",
    ]);
  });

  it("refuses a file that is not an object", () => {
    expect(validate(null)).toHaveLength(1);
    expect(validate([])[0]!.problem).toContain("not an array");
  });

  it("catches a username that the database pattern would reject", () => {
    const file = clone();
    file.accounts[0]!.username = "Keys Runner";
    expect(paths(file)).toContain("accounts[0].username");
  });

  it("catches a duplicate username, post id, and reply id", () => {
    const file = clone();
    file.accounts.push({ ...file.accounts[0]! });
    file.posts.push({ ...file.posts[0]! });
    file.replies.push({ ...file.replies[0]! });

    expect(paths(file)).toEqual(
      expect.arrayContaining(["accounts[2].username", "posts[1].id", "replies[1].id"]),
    );
  });

  it("catches an author nobody in the file matches", () => {
    const file = clone();
    file.posts[0]!.author = "ghost";
    expect(paths(file)).toContain("posts[0].author");
  });

  it("catches a reply pointing at a post that is not there", () => {
    const file = clone();
    file.replies[0]!.post_id = "p999";
    expect(paths(file)).toContain("replies[0].post_id");
  });

  it("catches an accepted answer that belongs to another post", () => {
    const file = clone();
    file.posts.push({ ...file.posts[0]!, id: "p2", accepted_reply_id: "r1" });

    const problem = validate(file).find((v) => v.path === "posts[1].accepted_reply_id");
    expect(problem?.problem).toContain("another post");
  });

  it("catches an accepted answer on a discussion", () => {
    const file = clone();
    file.posts[0]!.kind = "discussion";

    const problem = validate(file).find((v) => v.path === "posts[0].accepted_reply_id");
    expect(problem?.problem).toContain("only a question");
  });

  it("catches the app's own length limits", () => {
    const file = clone();
    file.posts[0]!.title = "a".repeat(141);
    file.posts[0]!.body = "";
    file.accounts[0]!.bio = "a".repeat(201);

    expect(paths(file)).toEqual(
      expect.arrayContaining(["posts[0].title", "posts[0].body", "accounts[0].bio"]),
    );
  });

  it("catches a spoiler level out of range and a bad date", () => {
    const file = clone();
    file.posts[0]!.spoiler_level = 8;
    file.replies[0]!.created_at = "not a date";

    expect(paths(file)).toEqual(expect.arrayContaining(["posts[0].spoiler_level", "replies[0].created_at"]));
  });

  it("catches negative and fractional vote counts", () => {
    const file = clone();
    file.posts[0]!.upvotes = -1;
    file.replies[0]!.downvotes = 1.5;

    expect(paths(file)).toEqual(expect.arrayContaining(["posts[0].upvotes", "replies[0].downvotes"]));
  });
});

describe("renderSchemaDoc", () => {
  it("describes what is actually in the file", () => {
    const doc = renderSchemaDoc(GOOD);

    expect(doc).toContain("| Accounts | 2 |");
    expect(doc).toContain("| Posts | 1 |");
    expect(doc).toContain("| Replies | 1 |");
    expect(doc).toContain("| Posts with an accepted answer | 1 |");
    expect(doc).toContain("| Vote rows the import will write | 7 |");
  });

  it("names the persona field as documentation rather than data", () => {
    expect(renderSchemaDoc(GOOD)).toContain("never imported");
  });
});

describe("deterministic ids", () => {
  it("produce a valid version 5 uuid", () => {
    expect(uuidv5("account:keysrunner")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("are stable across calls, which is what makes a re-run an update", () => {
    expect(ids.post("p1")).toBe(ids.post("p1"));
    expect(ids.account("keysrunner")).toBe(ids.account("keysrunner"));
  });

  it("separate the namespaces, so a post and a reply with one id do not collide", () => {
    expect(ids.post("x1")).not.toBe(ids.reply("x1"));
    expect(ids.account("x1")).not.toBe(ids.voter(1));
  });

  it("key an account off its username, so reordering the file changes nothing", () => {
    expect(ids.account("mapnerd")).not.toBe(ids.account("keysrunner"));
  });

  it("shuffle deterministically", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffled(items, "seed-a")).toEqual(shuffled(items, "seed-a"));
    expect(shuffled(items, "seed-a")).not.toEqual(shuffled(items, "seed-b"));
    expect([...shuffled(items, "seed-a")].sort()).toEqual(items);
  });

  it("give a repeatable stream from a seeded generator", () => {
    const first = seededRandom("x");
    const second = seededRandom("x");
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });
});

describe("the voter pool", () => {
  it("never drops below the floor", () => {
    expect(voterPoolSize(GOOD)).toBe(80);
  });

  it("grows to cover the busiest item, because one account votes once", () => {
    const file = clone();
    file.posts[0]!.upvotes = 300;
    file.posts[0]!.downvotes = 20;

    expect(voterPoolSize(file)).toBe(320);
  });
});

describe("buildVotes", () => {
  const NOW = Date.parse("2026-09-05T00:00:00Z");

  it("writes one row per vote the file asks for", () => {
    expect(buildVotes(GOOD, 80, NOW)).toHaveLength(7);
  });

  it("nets out to exactly upvotes minus downvotes", () => {
    const rows = buildVotes(GOOD, 80, NOW);
    const net = (id: string) =>
      rows.filter((row) => row.target_id === id).reduce((sum, row) => sum + row.value, 0);

    expect(net(ids.post("p1"))).toBe(3);
    expect(net(ids.reply("r1"))).toBe(2);
  });

  it("uses a distinct voter for every vote on an item", () => {
    const rows = buildVotes(GOOD, 80, NOW).filter((row) => row.target_id === ids.post("p1"));
    expect(new Set(rows.map((row) => row.user_id)).size).toBe(rows.length);
  });

  it("dates every vote after the item and before now", () => {
    for (const row of buildVotes(GOOD, 80, NOW)) {
      const at = Date.parse(row.created_at);
      expect(at).toBeGreaterThanOrEqual(Date.parse("2026-08-01T10:00:00Z"));
      expect(at).toBeLessThanOrEqual(NOW);
    }
  });

  it("is deterministic, so two runs write the same rows", () => {
    expect(buildVotes(GOOD, 80, NOW)).toEqual(buildVotes(GOOD, 80, NOW));
  });

  it("skips an item nobody voted on", () => {
    const file = clone();
    file.posts[0]!.upvotes = 0;
    file.posts[0]!.downvotes = 0;

    expect(buildVotes(file, 80, NOW).every((row) => row.target_id !== ids.post("p1"))).toBe(true);
  });

  it("refuses rather than quietly miscounting when the pool is too small", () => {
    const file = clone();
    file.posts[0]!.upvotes = 100;

    expect(() => buildVotes(file, 80, NOW)).toThrow(/needs 101 distinct voters/);
  });
});
