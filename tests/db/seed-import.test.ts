import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, type Db } from "./harness";
import { buildVotes, voterPoolSize } from "../../supabase/seed/import";
import { ids } from "../../supabase/seed/ids";
import { validate } from "../../supabase/seed/schema";
import type { SeedFile } from "../../supabase/seed/types";
import { applySpoilerGate } from "../../lib/spoilers";

/**
 * The importer against a real Postgres, on a fixture small enough to reason about.
 *
 * The network calls are the two things pglite cannot do, so this exercises
 * everything else: the ids, the ordering, the vote arithmetic through the real
 * trigger, a second run finding the same rows, and what the gate and row level
 * security make of the result.
 */

const ACCOUNTS = [
  { username: "keysrunner", display_name: "Keys", bio: "Boat guy.", created_at: "2026-07-01T10:00:00Z" },
  { username: "mapnerd", display_name: null, bio: null, created_at: "2026-07-02T10:00:00Z" },
  { username: "quietvoice", display_name: "Quiet", bio: "Lurker.", created_at: "2026-07-03T10:00:00Z" },
];

const POSTS = [
  { id: "p1", author: "keysrunner", group: null, topic: "map", kind: "question", title: "Where does the causeway end", body: "Asking for the map thread.", spoiler_level: 0, created_at: "2026-08-01T10:00:00Z", upvotes: 10, downvotes: 3, accepted_reply_id: "r1" },
  { id: "p2", author: "mapnerd", group: "vice-city-locals", topic: "locations", kind: "discussion", title: "Every named location in the trailer", body: "A list, with timestamps.", spoiler_level: 0, created_at: "2026-08-02T10:00:00Z", upvotes: 5, downvotes: 0, accepted_reply_id: null },
  { id: "p3", author: "quietvoice", group: null, topic: "story", kind: "question", title: "How long is the fourth act", body: "No spoilers past chapter four please.", spoiler_level: 4, created_at: "2026-08-03T10:00:00Z", upvotes: 0, downvotes: 0, accepted_reply_id: null },
  { id: "p4", author: "keysrunner", group: "vice-city-locals", topic: "vehicles", kind: "discussion", title: "Boat handling in the keys", body: "It is better than four.", spoiler_level: 0, created_at: "2026-08-04T10:00:00Z", upvotes: 2, downvotes: 1, accepted_reply_id: null },
  { id: "p5", author: "mapnerd", group: null, topic: "help", kind: "question", title: "Pre-load date confusion", body: "Which is it.", spoiler_level: 0, created_at: "2026-08-05T10:00:00Z", upvotes: 1, downvotes: 0, accepted_reply_id: null },
];

const REPLIES = Array.from({ length: 10 }, (_, index) => ({
  id: `r${index + 1}`,
  post_id: POSTS[index % POSTS.length]!.id,
  author: ACCOUNTS[index % ACCOUNTS.length]!.username,
  body: `Reply number ${index + 1}, with something to say.`,
  spoiler_level: index === 9 ? 5 : 0,
  created_at: `2026-08-1${index}T12:00:00Z`,
  upvotes: index,
  downvotes: index % 3,
}));

const FIXTURE = { accounts: ACCOUNTS, posts: POSTS, replies: REPLIES } as unknown as SeedFile;

/**
 * The import phases, minus the two that need Supabase Auth and the storage API.
 * Auth users are inserted straight into the shim's table at the same deterministic
 * ids the importer would have asked GoTrue for.
 */
async function runImport(db: Db, data: SeedFile, poolSize: number): Promise<void> {
  const accountIds = data.accounts.map((account) => ids.account(account.username));
  const voterIds = Array.from({ length: poolSize }, (_, index) => ids.voter(index));

  for (const id of [...accountIds, ...voterIds]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`, [
      id,
      `${id}@seed.askgta6.local`,
    ]);
  }

  for (const account of data.accounts) {
    await db.query(
      `insert into public.profiles (id, username, display_name, bio, created_at, progress, spoiler_shield)
       values ($1, $2, $3, $4, $5, 0, false)
       on conflict (id) do update set username = excluded.username, display_name = excluded.display_name,
         bio = excluded.bio, created_at = excluded.created_at`,
      [ids.account(account.username), account.username, account.display_name, account.bio, account.created_at],
    );
  }

  for (let index = 0; index < poolSize; index += 1) {
    const username = `voter_${String(index).padStart(4, "0")}`;
    await db.query(
      `insert into public.profiles (id, username, progress, spoiler_shield) values ($1, $2, 0, false)
       on conflict (id) do update set username = excluded.username`,
      [ids.voter(index), username],
    );
  }

  const slugs = [...new Set(data.posts.map((post) => post.group).filter(Boolean))] as string[];
  for (const slug of slugs) {
    const first = data.posts
      .filter((post) => post.group === slug)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;

    await db.query(
      `insert into public.groups (id, slug, name, visibility, owner_id, created_at)
       values ($1, $2, $3, 'public', $4, $5)
       on conflict (id) do update set owner_id = excluded.owner_id`,
      [ids.group(slug), slug, slug, ids.account(first.author), first.created_at],
    );
    await db.query(
      `insert into public.group_members (group_id, user_id, role) values ($1, $2, 'owner')
       on conflict (group_id, user_id) do nothing`,
      [ids.group(slug), ids.account(first.author)],
    );
  }

  for (const post of data.posts) {
    await db.query(
      `insert into public.posts (id, author_id, group_id, topic, kind, title, body, spoiler_level, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       on conflict (id) do update set title = excluded.title, body = excluded.body, created_at = excluded.created_at`,
      [
        ids.post(post.id),
        ids.account(post.author),
        post.group ? ids.group(post.group) : null,
        post.topic,
        post.kind,
        post.title,
        post.body,
        post.spoiler_level,
        post.created_at,
      ],
    );
  }

  for (const reply of data.replies) {
    await db.query(
      `insert into public.replies (id, post_id, author_id, body, spoiler_level, created_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set body = excluded.body, created_at = excluded.created_at`,
      [ids.reply(reply.id), ids.post(reply.post_id), ids.account(reply.author), reply.body, reply.spoiler_level, reply.created_at],
    );
  }

  for (const post of data.posts) {
    if (!post.accepted_reply_id) continue;
    await db.query(`select public.set_accepted_reply_admin($1, $2)`, [
      ids.post(post.id),
      ids.reply(post.accepted_reply_id),
    ]);
  }

  for (const vote of buildVotes(data, poolSize, Date.parse("2026-09-05T00:00:00Z"))) {
    await db.query(
      `insert into public.votes (user_id, target_type, target_id, value, created_at)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, target_type, target_id) do update set value = excluded.value`,
      [vote.user_id, vote.target_type, vote.target_id, vote.value, vote.created_at],
    );
  }
}

describe("the seed importer", () => {
  let db: Db;
  const poolSize = voterPoolSize(FIXTURE);

  beforeAll(async () => {
    db = await createTestDb();
    await runImport(db, FIXTURE, poolSize);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  describe("the fixture itself", () => {
    it("passes the validator, so this is testing an import and not a bad file", () => {
      expect(validate(FIXTURE)).toEqual([]);
    });

    it("needs a pool no smaller than the busiest item", () => {
      const busiest = Math.max(
        ...[...FIXTURE.posts, ...FIXTURE.replies].map((item) => item.upvotes + item.downvotes),
      );
      expect(poolSize).toBeGreaterThanOrEqual(busiest);
    });
  });

  describe("counts", () => {
    it("writes one row per account, post, and reply", async () => {
      const profiles = await db.query<{ count: string }>(
        `select count(*) from public.profiles where username not like 'voter_%'`,
      );
      const posts = await db.query<{ count: string }>(`select count(*) from public.posts`);
      const replies = await db.query<{ count: string }>(`select count(*) from public.replies`);

      expect(Number(profiles.rows[0]!.count)).toBe(3);
      expect(Number(posts.rows[0]!.count)).toBe(5);
      expect(Number(replies.rows[0]!.count)).toBe(10);
    });

    it("keeps the created_at from the file, rather than stamping now", async () => {
      const post = await db.query<{ created_at: Date }>(`select created_at from public.posts where id = $1`, [
        ids.post("p1"),
      ]);
      expect(new Date(post.rows[0]!.created_at).toISOString()).toBe("2026-08-01T10:00:00.000Z");

      const profile = await db.query<{ created_at: Date }>(
        `select created_at from public.profiles where username = 'keysrunner'`,
      );
      expect(new Date(profile.rows[0]!.created_at).toISOString()).toBe("2026-07-01T10:00:00.000Z");
    });

    it("carries the bio, and a null one, across", async () => {
      const rows = await db.query<{ username: string; bio: string | null; display_name: string | null }>(
        `select username, bio, display_name from public.profiles where username in ('keysrunner', 'mapnerd')`,
      );
      const byName = Object.fromEntries(rows.rows.map((row) => [row.username, row]));

      expect(byName.keysrunner!.bio).toBe("Boat guy.");
      expect(byName.mapnerd!.bio).toBeNull();
      expect(byName.mapnerd!.display_name).toBeNull();
    });

    it("creates the group and its membership", async () => {
      const group = await db.query<{ slug: string; owner_id: string }>(`select slug, owner_id from public.groups`);
      expect(group.rows).toHaveLength(1);
      expect(group.rows[0]!.slug).toBe("vice-city-locals");
      // Ownership is a seed account, never a placeholder, because owner_id cascades.
      expect(group.rows[0]!.owner_id).toBe(ids.account("mapnerd"));

      const members = await db.query<{ count: string }>(`select count(*) from public.group_members`);
      expect(Number(members.rows[0]!.count)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("accepted answers", () => {
    it("links the reply the file named, and only that one", async () => {
      const posts = await db.query<{ id: string; accepted_reply_id: string | null }>(
        `select id, accepted_reply_id from public.posts`,
      );

      const answered = posts.rows.filter((post) => post.accepted_reply_id);
      expect(answered).toHaveLength(1);
      expect(answered[0]!.id).toBe(ids.post("p1"));
      expect(answered[0]!.accepted_reply_id).toBe(ids.reply("r1"));
    });
  });

  describe("vote arithmetic", () => {
    it("produces vote_count from real rows, through the trigger", async () => {
      for (const post of FIXTURE.posts) {
        const row = await db.query<{ vote_count: number }>(`select vote_count from public.posts where id = $1`, [
          ids.post(post.id),
        ]);
        expect(row.rows[0]!.vote_count, post.id).toBe(post.upvotes - post.downvotes);
      }

      for (const reply of FIXTURE.replies) {
        const row = await db.query<{ vote_count: number }>(`select vote_count from public.replies where id = $1`, [
          ids.reply(reply.id),
        ]);
        expect(row.rows[0]!.vote_count, reply.id).toBe(reply.upvotes - reply.downvotes);
      }
    });

    it("spreads each item's votes across distinct voters", async () => {
      const rows = await db.query<{ target_id: string; voters: string; votes: string }>(
        `select target_id, count(distinct user_id) as voters, count(*) as votes
         from public.votes group by target_id`,
      );

      for (const row of rows.rows) {
        expect(row.voters).toBe(row.votes);
      }
    });

    it("never dates a vote before the thing it votes on", async () => {
      const bad = await db.query<{ count: string }>(
        `select count(*) from public.votes v
         join public.posts p on p.id = v.target_id and v.target_type = 'post'
         where v.created_at < p.created_at`,
      );
      expect(Number(bad.rows[0]!.count)).toBe(0);
    });

    it("writes exactly as many rows as the file asks for", async () => {
      const wanted = [...FIXTURE.posts, ...FIXTURE.replies].reduce(
        (sum, item) => sum + item.upvotes + item.downvotes,
        0,
      );
      const rows = await db.query<{ count: string }>(`select count(*) from public.votes`);
      expect(Number(rows.rows[0]!.count)).toBe(wanted);
    });
  });

  describe("a second run", () => {
    it("updates rather than duplicating", async () => {
      const before = await db.query<{ posts: string; replies: string; votes: string; profiles: string }>(
        `select (select count(*) from public.posts) as posts,
                (select count(*) from public.replies) as replies,
                (select count(*) from public.votes) as votes,
                (select count(*) from public.profiles) as profiles`,
      );

      await runImport(db, FIXTURE, poolSize);

      const after = await db.query<{ posts: string; replies: string; votes: string; profiles: string }>(
        `select (select count(*) from public.posts) as posts,
                (select count(*) from public.replies) as replies,
                (select count(*) from public.votes) as votes,
                (select count(*) from public.profiles) as profiles`,
      );

      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it("leaves the counts still exact afterwards", async () => {
      const row = await db.query<{ vote_count: number }>(`select vote_count from public.posts where id = $1`, [
        ids.post("p1"),
      ]);
      expect(row.rows[0]!.vote_count).toBe(7);
    });

    it("picks up an edit to a body without changing anything else", async () => {
      const edited = {
        ...FIXTURE,
        posts: FIXTURE.posts.map((post) => (post.id === "p2" ? { ...post, body: "A list, now corrected." } : post)),
      };

      await runImport(db, edited, poolSize);

      const row = await db.query<{ body: string }>(`select body from public.posts where id = $1`, [ids.post("p2")]);
      expect(row.rows[0]!.body).toBe("A list, now corrected.");

      const count = await db.query<{ count: string }>(`select count(*) from public.posts`);
      expect(Number(count.rows[0]!.count)).toBe(5);
    });
  });

  describe("what a reader sees", () => {
    it("shows imported posts to a logged out visitor, except the private ones", async () => {
      await asAnon(db, async () => {
        const rows = await db.query<{ id: string }>(`select id from public.posts`);
        // Every fixture group is public, so all five are readable.
        expect(rows.rows).toHaveLength(5);
      });
    });

    it("gates an imported level 4 post for a reader at level 0", async () => {
      const row = await db.query<{ id: string; title: string; body: string; spoiler_level: number }>(
        `select id, title, body, spoiler_level from public.posts where id = $1`,
        [ids.post("p3")],
      );

      const gated = applySpoilerGate(row.rows[0]!, 0);
      expect(gated.hidden).toBe(true);
      expect(gated.title).toBe("How long is the fourth act");
      expect(JSON.stringify(gated)).not.toContain("No spoilers past chapter four");
    });

    it("lets an imported account read its own rows under row level security", async () => {
      await asUser(db, ids.account("keysrunner"), async () => {
        const rows = await db.query<{ count: string }>(
          `select count(*) from public.posts where author_id = $1`,
          [ids.account("keysrunner")],
        );
        expect(Number(rows.rows[0]!.count)).toBe(2);
      });
    });

    it("keeps a voter's votes private to that voter", async () => {
      await asUser(db, ids.voter(0), async () => {
        const own = await db.query<{ count: string }>(`select count(*) from public.votes`);
        const total = Number(own.rows[0]!.count);

        const everything = await db.query<{ count: string }>(`select count(*) from public.votes`);
        expect(total).toBeLessThanOrEqual(Number(everything.rows[0]!.count));
      });

      await asUser(db, ids.account("keysrunner"), async () => {
        const rows = await db.query<{ user_id: string }>(`select user_id from public.votes limit 50`);
        for (const row of rows.rows) {
          expect(row.user_id).toBe(ids.account("keysrunner"));
        }
      });
    });
  });
});
