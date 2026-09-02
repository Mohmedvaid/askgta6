import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Db } from "./harness";
import { createPost, createReply, seedFixture, type Fixture } from "./fixtures";

describe("triggers and constraints", () => {
  let db: Db;
  let f: Fixture;

  beforeEach(async () => {
    db = await createTestDb();
    f = await seedFixture(db);
  });

  it("rejects usernames outside the allowed shape", async () => {
    const id = await createUser(db, "shape@example.com");
    await expect(
      db.query(`update public.profiles set username = $2 where id = $1`, [id, "No Spaces"]),
    ).rejects.toThrow();
    await expect(
      db.query(`update public.profiles set username = $2 where id = $1`, [id, "ab"]),
    ).rejects.toThrow();
  });

  it("rejects a duplicate username", async () => {
    const id = await createUser(db, "dupe@example.com");
    await expect(
      db.query(`update public.profiles set username = $2 where id = $1`, [id, "alice"]),
    ).rejects.toThrow();
  });

  it("keeps vote_count correct through insert, flip, and delete", async () => {
    const postId = await createPost(db, f.alice);
    const count = async () => {
      const r = await db.query<{ vote_count: number }>(
        `select vote_count from public.posts where id = $1`,
        [postId],
      );
      return r.rows[0]!.vote_count;
    };

    await db.query(`insert into public.votes (user_id, target_type, target_id, value) values ($1, 'post', $2, 1)`, [f.bob, postId]);
    expect(await count()).toBe(1);

    await db.query(`insert into public.votes (user_id, target_type, target_id, value) values ($1, 'post', $2, 1)`, [f.carol, postId]);
    expect(await count()).toBe(2);

    await db.query(`update public.votes set value = -1 where user_id = $1 and target_id = $2`, [f.bob, postId]);
    expect(await count()).toBe(0);

    await db.query(`delete from public.votes where user_id = $1 and target_id = $2`, [f.bob, postId]);
    expect(await count()).toBe(1);
  });

  it("keeps reply_count correct through insert and delete", async () => {
    const postId = await createPost(db, f.alice);
    const replyId = await createReply(db, postId, f.bob);
    let r = await db.query<{ reply_count: number }>(`select reply_count from public.posts where id = $1`, [postId]);
    expect(r.rows[0]!.reply_count).toBe(1);

    await db.query(`delete from public.replies where id = $1`, [replyId]);
    r = await db.query<{ reply_count: number }>(`select reply_count from public.posts where id = $1`, [postId]);
    expect(r.rows[0]!.reply_count).toBe(0);
  });

  it("keeps member_count correct and adds the owner as a member", async () => {
    const r = await db.query<{ member_count: number }>(
      `select member_count from public.groups where id = $1`,
      [f.publicGroup],
    );
    expect(r.rows[0]!.member_count).toBe(2);

    await db.query(`delete from public.group_members where group_id = $1 and user_id = $2`, [f.publicGroup, f.bob]);
    const after = await db.query<{ member_count: number }>(
      `select member_count from public.groups where id = $1`,
      [f.publicGroup],
    );
    expect(after.rows[0]!.member_count).toBe(1);
  });

  it("hides a target at exactly five distinct reporters, not at four", async () => {
    const postId = await createPost(db, f.alice);
    const reporters: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      reporters.push(await createUser(db, `reporter${i}@example.com`));
    }

    const hidden = async () => {
      const r = await db.query<{ is_hidden: boolean }>(`select is_hidden from public.posts where id = $1`, [postId]);
      return r.rows[0]!.is_hidden;
    };

    for (const reporter of reporters.slice(0, 4)) {
      await db.query(
        `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`,
        [reporter, postId],
      );
    }
    expect(await hidden()).toBe(false);

    await db.query(
      `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'leak')`,
      [reporters[4], postId],
    );
    expect(await hidden()).toBe(true);
  });

  it("does not hide on five reports from the same reporter", async () => {
    const postId = await createPost(db, f.alice);
    await db.query(
      `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`,
      [f.bob, postId],
    );
    await expect(
      db.query(
        `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'other')`,
        [f.bob, postId],
      ),
    ).rejects.toThrow();

    const r = await db.query<{ is_hidden: boolean }>(`select is_hidden from public.posts where id = $1`, [postId]);
    expect(r.rows[0]!.is_hidden).toBe(false);
  });

  it("rate limits posts to five per author per minute", async () => {
    for (let i = 0; i < 5; i += 1) {
      await createPost(db, f.alice, { title: `Rate limit post number ${i}` });
    }
    await expect(createPost(db, f.alice, { title: "One post too many for now" })).rejects.toThrow(/rate limit/);
  });

  it("generates the search vector from title and body", async () => {
    const postId = await createPost(db, f.alice, {
      title: "Where can we find the swamp airboat",
      body: "Trailer two shows a boat in the wetlands.",
    });
    const r = await db.query<{ hit: boolean }>(
      `select search @@ websearch_to_tsquery('english', 'airboat wetlands') as hit from public.posts where id = $1`,
      [postId],
    );
    expect(r.rows[0]!.hit).toBe(true);
  });
});
