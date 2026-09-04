import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, setUsername, type Db } from "./harness";

/**
 * The url columns, against a real Postgres.
 *
 * These are written by a trigger rather than by the app, which is the only way
 * a post created by the seed importer, the composer, or a hand written insert
 * all end up addressable. So the trigger is the thing worth testing: that the
 * short id is assigned once and never moves, and that the slug always matches
 * the title it is derived from.
 */

/**
 * Posts are rate limited to five an author a minute, and these tests write more
 * than that, so each row is moved into the past once it exists. The limiter only
 * counts the last sixty seconds, so this is the same as waiting.
 */
async function insertPost(db: Db, authorId: string, title: string, kind = "question"): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.posts (author_id, topic, kind, title, body)
     values ($1, 'map', $2, $3, 'A body long enough to pass the check.') returning id`,
    [authorId, kind, title],
  );
  const id = result.rows[0]!.id;
  await db.query(`update public.posts set created_at = now() - interval '1 hour' where id = $1`, [id]);
  return id;
}

async function urlParts(db: Db, id: string) {
  const result = await db.query<{ short_id: string; slug: string }>(
    `select short_id, slug from public.posts where id = $1`,
    [id],
  );
  return result.rows[0]!;
}

describe("the post url columns", () => {
  let db: Db;
  let author: string;

  beforeAll(async () => {
    db = await createTestDb();
    author = await createUser(db, "mara@example.test");
    await setUsername(db, author, "mara");
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  describe("the short id", () => {
    it("is eight characters of base 36", async () => {
      const id = await insertPost(db, author, "How big is the Leonida map");
      expect((await urlParts(db, id)).short_id).toMatch(/^[0-9a-z]{8}$/);
    });

    it("is different for every post", async () => {
      const shortIds: string[] = [];
      for (let index = 0; index < 25; index += 1) {
        const id = await insertPost(db, author, `A distinct title number ${index}`);
        shortIds.push((await urlParts(db, id)).short_id);
      }

      expect(new Set(shortIds).size).toBe(shortIds.length);
    });

    it("cannot be chosen by whoever writes the row", async () => {
      const result = await db.query<{ id: string; short_id: string }>(
        `insert into public.posts (author_id, topic, kind, title, body, short_id)
         values ($1, 'map', 'question', 'A title picked by the client', 'A body long enough.', 'aaaaaaaa')
         returning id, short_id`,
        [author],
      );
      await db.query(`update public.posts set created_at = now() - interval '1 hour' where id = $1`, [
        result.rows[0]!.id,
      ]);

      expect(result.rows[0]!.short_id).not.toBe("aaaaaaaa");
      expect(result.rows[0]!.short_id).toMatch(/^[0-9a-z]{8}$/);
    });

    it("does not move when the post is edited", async () => {
      const id = await insertPost(db, author, "A title that is about to change");
      const before = (await urlParts(db, id)).short_id;

      await db.query(`update public.posts set title = $2, short_id = 'bbbbbbbb' where id = $1`, [
        id,
        "A title that has now changed",
      ]);

      expect((await urlParts(db, id)).short_id).toBe(before);
    });

    it("is backed by a unique index, so two posts can never share one", async () => {
      const result = await db.query<{ count: string }>(
        `select count(*) from pg_indexes where schemaname = 'public' and indexname = 'posts_short_id_key'`,
      );
      expect(Number(result.rows[0]!.count)).toBe(1);

      // And it cannot be cleared, which is what makes the index worth having: the
      // trigger puts the old value back rather than letting the row lose its url.
      const id = await insertPost(db, author, "A post that tries to drop its short id");
      const before = (await urlParts(db, id)).short_id;
      await db.query(`update public.posts set short_id = null where id = $1`, [id]);

      expect((await urlParts(db, id)).short_id).toBe(before);
    });
  });

  describe("the slug", () => {
    it("is the title, lowercased and hyphenated", async () => {
      const id = await insertPost(db, author, "How big is the Leonida map");
      expect((await urlParts(db, id)).slug).toBe("how-big-is-the-leonida-map");
    });

    it("collapses punctuation rather than carrying it into a url", async () => {
      const id = await insertPost(db, author, "Radio stations & the *best* one?!  ");
      expect((await urlParts(db, id)).slug).toBe("radio-stations-the-best-one");
    });

    it("stops at 60 characters, and never on a hyphen", async () => {
      const id = await insertPost(
        db,
        author,
        "This title is deliberately far longer than sixty characters so that it has to be cut somewhere",
      );
      const slug = (await urlParts(db, id)).slug;

      expect(slug.length).toBeLessThanOrEqual(60);
      expect(slug.endsWith("-")).toBe(false);
    });

    it("falls back to a word rather than an empty path segment", async () => {
      const result = await db.query<{ slug: string }>(`select public.post_slug('!!! ??? ...') as slug`);
      expect(result.rows[0]!.slug).toBe("post");
    });

    it("is regenerated when the title is edited", async () => {
      const id = await insertPost(db, author, "The original title of this thread");
      expect((await urlParts(db, id)).slug).toBe("the-original-title-of-this-thread");

      await db.query(`update public.posts set title = $2 where id = $1`, [id, "The corrected title of it"]);
      expect((await urlParts(db, id)).slug).toBe("the-corrected-title-of-it");
    });

    it("is not left alone when only the body is edited, because it is derived and not stored input", async () => {
      const id = await insertPost(db, author, "A title that is staying put");

      await db.query(`update public.posts set body = 'A different body.', slug = 'something-else' where id = $1`, [
        id,
      ]);

      expect((await urlParts(db, id)).slug).toBe("a-title-that-is-staying-put");
    });
  });
});
