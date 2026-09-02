import { beforeEach, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, type Db } from "./harness";
import { createPost, createReply, seedFixture, type Fixture } from "./fixtures";

describe("callable functions", () => {
  let db: Db;
  let f: Fixture;
  let postId: string;

  beforeEach(async () => {
    db = await createTestDb();
    f = await seedFixture(db);
    postId = await createPost(db, f.alice, { title: "Which vehicle from trailer two" });
  });

  it("set_progress updates the caller and rejects out of range levels", async () => {
    await asUser(db, f.bob, async () => {
      await db.query(`select public.set_progress(4::smallint)`);
      await expect(db.query(`select public.set_progress(9::smallint)`)).rejects.toThrow(/between 0 and 7/);
    });

    const r = await db.query<{ progress: number }>(`select progress from public.profiles where id = $1`, [f.bob]);
    expect(r.rows[0]!.progress).toBe(4);
  });

  it("set_progress rejects a logged out caller", async () => {
    await asAnon(db, async () => {
      await expect(db.query(`select public.set_progress(1::smallint)`)).rejects.toThrow();
    });
  });

  it("accept_reply works for the post author only", async () => {
    const replyId = await createReply(db, postId, f.bob);

    await asUser(db, f.bob, async () => {
      await expect(db.query(`select public.accept_reply($1, $2)`, [postId, replyId])).rejects.toThrow(
        /only the post author/,
      );
    });

    await asUser(db, f.alice, async () => {
      await db.query(`select public.accept_reply($1, $2)`, [postId, replyId]);
    });

    const r = await db.query<{ accepted_reply_id: string }>(
      `select accepted_reply_id from public.posts where id = $1`,
      [postId],
    );
    expect(r.rows[0]!.accepted_reply_id).toBe(replyId);
  });

  it("accept_reply rejects a reply from another post", async () => {
    const otherPost = await createPost(db, f.alice, { title: "A different question entirely" });
    const foreignReply = await createReply(db, otherPost, f.bob);

    await asUser(db, f.alice, async () => {
      await expect(db.query(`select public.accept_reply($1, $2)`, [postId, foreignReply])).rejects.toThrow(
        /does not belong/,
      );
    });
  });

  it("accept_reply leaves the guard trigger armed afterwards", async () => {
    const replyId = await createReply(db, postId, f.bob);
    await asUser(db, f.alice, async () => {
      await db.query(`select public.accept_reply($1, $2)`, [postId, replyId]);
      await expect(db.query(`update public.posts set is_hidden = true where id = $1`, [postId])).rejects.toThrow(
        /maintained by the server/,
      );
    });
  });

  it("cast_vote upserts, flips, and clears on zero", async () => {
    const total = async () => {
      const r = await db.query<{ vote_count: number }>(`select vote_count from public.posts where id = $1`, [postId]);
      return r.rows[0]!.vote_count;
    };

    await asUser(db, f.bob, async () => {
      await db.query(`select public.cast_vote('post', $1, 1::smallint)`, [postId]);
    });
    expect(await total()).toBe(1);

    await asUser(db, f.bob, async () => {
      await db.query(`select public.cast_vote('post', $1, -1::smallint)`, [postId]);
    });
    expect(await total()).toBe(-1);

    await asUser(db, f.bob, async () => {
      await db.query(`select public.cast_vote('post', $1, 0::smallint)`, [postId]);
    });
    expect(await total()).toBe(0);
  });

  it("cast_vote refuses a post the caller cannot read", async () => {
    const privatePost = await createPost(db, f.alice, { groupId: f.privateGroup, title: "Hidden from outsiders here" });
    await asUser(db, f.carol, async () => {
      await expect(db.query(`select public.cast_vote('post', $1, 1::smallint)`, [privatePost])).rejects.toThrow(
        /post not found/,
      );
    });
  });

  it("cast_vote refuses a logged out caller", async () => {
    await asAnon(db, async () => {
      await expect(db.query(`select public.cast_vote('post', $1, 1::smallint)`, [postId])).rejects.toThrow();
    });
  });

  it("join_group_by_invite adds the caller and returns the slug", async () => {
    const slug = await asUser(db, f.carol, async () => {
      const r = await db.query<{ join_group_by_invite: string }>(`select public.join_group_by_invite($1)`, [
        f.inviteCode,
      ]);
      return r.rows[0]!.join_group_by_invite;
    });
    expect(slug).toBe("night-shift");

    const membership = await db.query(
      `select 1 from public.group_members where group_id = $1 and user_id = $2`,
      [f.privateGroup, f.carol],
    );
    expect(membership.rows).toHaveLength(1);
  });

  it("join_group_by_invite rejects unknown and expired codes", async () => {
    await db.query(
      `insert into public.group_invites (group_id, code, created_by, expires_at)
       values ($1, 'EXPIRED1', $2, now() - interval '1 day')`,
      [f.privateGroup, f.alice],
    );

    await asUser(db, f.carol, async () => {
      await expect(db.query(`select public.join_group_by_invite('NOPE99')`)).rejects.toThrow(/not found/);
      await expect(db.query(`select public.join_group_by_invite('EXPIRED1')`)).rejects.toThrow(/expired/);
    });
  });

  it("keeps set_hidden out of reach of ordinary users", async () => {
    await asUser(db, f.bob, async () => {
      await expect(db.query(`select public.set_hidden('post', $1, true)`, [postId])).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});
