import { beforeEach, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, type Db } from "./harness";
import { createPost, createReply, seedFixture, type Fixture } from "./fixtures";

describe("row level security", () => {
  let db: Db;
  let f: Fixture;
  let publicPost: string;
  let privatePost: string;
  let openPost: string;

  beforeEach(async () => {
    db = await createTestDb();
    f = await seedFixture(db);
    openPost = await createPost(db, f.alice, { title: "An ungrouped question about vehicles" });
    publicPost = await createPost(db, f.alice, {
      groupId: f.publicGroup,
      title: "A public group question about the map",
    });
    privatePost = await createPost(db, f.alice, {
      groupId: f.privateGroup,
      title: "A private group thread about night races",
      body: "Only night shift members should ever see this line.",
    });
  });

  const visibleIds = async (userId: string | null) => {
    const run = async () => {
      const r = await db.query<{ id: string }>(`select id from public.posts order by created_at`);
      return r.rows.map((row) => row.id);
    };
    return userId ? asUser(db, userId, run) : asAnon(db, run);
  };

  it("hides private group posts from non-members in select", async () => {
    expect(await visibleIds(f.bob)).toEqual(expect.arrayContaining([openPost, publicPost, privatePost]));
    const carolSees = await visibleIds(f.carol);
    expect(carolSees).toContain(openPost);
    expect(carolSees).toContain(publicPost);
    expect(carolSees).not.toContain(privatePost);
  });

  it("hides private group posts from logged out visitors", async () => {
    const anonSees = await visibleIds(null);
    expect(anonSees).toContain(openPost);
    expect(anonSees).toContain(publicPost);
    expect(anonSees).not.toContain(privatePost);
  });

  it("hides private group posts from search", async () => {
    const search = async (userId: string) =>
      asUser(db, userId, async () => {
        const r = await db.query<{ id: string }>(
          `select id from public.posts where search @@ websearch_to_tsquery('english', 'night races')`,
        );
        return r.rows.map((row) => row.id);
      });

    expect(await search(f.bob)).toContain(privatePost);
    expect(await search(f.carol)).toEqual([]);
  });

  it("hides private group posts from counts", async () => {
    const total = async (userId: string) =>
      asUser(db, userId, async () => {
        const r = await db.query<{ count: string }>(`select count(*)::text as count from public.posts`);
        return Number(r.rows[0]!.count);
      });

    expect(await total(f.bob)).toBe(3);
    expect(await total(f.carol)).toBe(2);
  });

  it("hides the private group row itself from non-members", async () => {
    const slugs = async (userId: string) =>
      asUser(db, userId, async () => {
        const r = await db.query<{ slug: string }>(`select slug from public.groups order by slug`);
        return r.rows.map((row) => row.slug);
      });

    expect(await slugs(f.bob)).toEqual(["night-shift", "vice-city-locals"]);
    expect(await slugs(f.carol)).toEqual(["vice-city-locals"]);
  });

  it("lets members post in a group and blocks non-members", async () => {
    await asUser(db, f.bob, async () => {
      await db.query(
        `insert into public.posts (author_id, group_id, topic, kind, title, body)
         values ($1, $2, 'general', 'discussion', 'Members can post in here', 'Body text.')`,
        [f.bob, f.privateGroup],
      );
    });

    await expect(
      asUser(db, f.carol, async () => {
        await db.query(
          `insert into public.posts (author_id, group_id, topic, kind, title, body)
           values ($1, $2, 'general', 'discussion', 'Non members cannot post', 'Body text.')`,
          [f.carol, f.privateGroup],
        );
      }),
    ).rejects.toThrow();
  });

  it("blocks posting as somebody else", async () => {
    await expect(
      asUser(db, f.carol, async () => {
        await db.query(
          `insert into public.posts (author_id, topic, kind, title, body)
           values ($1, 'general', 'discussion', 'Impersonating another author', 'Body text.')`,
          [f.alice],
        );
      }),
    ).rejects.toThrow();
  });

  it("blocks updating another user's post", async () => {
    await asUser(db, f.carol, async () => {
      const r = await db.query(`update public.posts set title = 'Hijacked title here' where id = $1`, [openPost]);
      expect(r.affectedRows).toBe(0);
    });

    const check = await db.query<{ title: string }>(`select title from public.posts where id = $1`, [openPost]);
    expect(check.rows[0]!.title).toBe("An ungrouped question about vehicles");
  });

  it("blocks updating another user's profile", async () => {
    await asUser(db, f.carol, async () => {
      const r = await db.query(`update public.profiles set display_name = 'Not Alice' where id = $1`, [f.alice]);
      expect(r.affectedRows).toBe(0);
    });
  });

  it("blocks clients writing vote_count, reply_count, is_hidden, or accepted_reply_id", async () => {
    const replyId = await createReply(db, openPost, f.bob);

    await asUser(db, f.alice, async () => {
      for (const sql of [
        `update public.posts set vote_count = 99 where id = $1`,
        `update public.posts set reply_count = 99 where id = $1`,
        `update public.posts set is_hidden = true where id = $1`,
      ]) {
        await expect(db.query(sql, [openPost])).rejects.toThrow(/maintained by the server/);
      }
      await expect(
        db.query(`update public.posts set accepted_reply_id = $2 where id = $1`, [openPost, replyId]),
      ).rejects.toThrow(/maintained by the server/);
    });

    // Bob owns the reply, so RLS lets the statement through and the guard trigger is what stops it.
    await asUser(db, f.bob, async () => {
      await expect(
        db.query(`update public.replies set vote_count = 42 where id = $1`, [replyId]),
      ).rejects.toThrow(/maintained by the server/);
      await expect(
        db.query(`update public.replies set is_hidden = true where id = $1`, [replyId]),
      ).rejects.toThrow(/maintained by the server/);
    });
  });

  it("blocks direct writes to votes", async () => {
    await expect(
      asUser(db, f.bob, async () => {
        await db.query(
          `insert into public.votes (user_id, target_type, target_id, value) values ($1, 'post', $2, 1)`,
          [f.bob, openPost],
        );
      }),
    ).rejects.toThrow();
  });

  it("lets a user read only their own votes", async () => {
    await asUser(db, f.bob, async () => {
      await db.query(`select public.cast_vote('post', $1, 1::smallint)`, [openPost]);
    });
    await asUser(db, f.carol, async () => {
      await db.query(`select public.cast_vote('post', $1, 1::smallint)`, [openPost]);
    });

    const own = await asUser(db, f.bob, async () => {
      const r = await db.query<{ user_id: string }>(`select user_id from public.votes`);
      return r.rows;
    });
    expect(own).toHaveLength(1);
    expect(own[0]!.user_id).toBe(f.bob);
  });

  it("gives nobody but the author sight of a hidden post", async () => {
    await db.query(`select public.set_hidden('post', $1, true)`, [openPost]);

    expect(await visibleIds(f.carol)).not.toContain(openPost);
    expect(await visibleIds(f.alice)).toContain(openPost);
  });

  it("keeps reports write only for regular users, and readable for an admin", async () => {
    await asUser(db, f.bob, async () => {
      await db.query(
        `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`,
        [f.bob, openPost],
      );
      // The grant exists so admins can read the queue. A regular reader gets no
      // rows rather than an error, including the report they just filed.
      const own = await db.query(`select * from public.reports`);
      expect(own.rows).toHaveLength(0);
    });

    await db.query(`update public.profiles set is_admin = true where id = $1`, [f.alice]);
    await asUser(db, f.alice, async () => {
      const queue = await db.query(`select * from public.reports`);
      expect(queue.rows).toHaveLength(1);
    });
    await db.query(`update public.profiles set is_admin = false where id = $1`, [f.alice]);
  });

  it("hides replies that belong to an invisible post", async () => {
    await createReply(db, privatePost, f.bob, "A reply inside the private group.");
    const seen = async (userId: string) =>
      asUser(db, userId, async () => {
        const r = await db.query<{ id: string }>(`select id from public.replies`);
        return r.rows.length;
      });

    expect(await seen(f.bob)).toBe(1);
    expect(await seen(f.carol)).toBe(0);
  });
});

describe("ranked search", () => {
  let db: Db;
  let f: Fixture;

  beforeEach(async () => {
    db = await createTestDb();
    f = await seedFixture(db);
    await createPost(db, f.alice, { title: "Airboat routes through the wetlands", body: "Wetlands airboat notes." });
    await createPost(db, f.alice, {
      groupId: f.privateGroup,
      title: "Airboat smuggling run at night",
      body: "Wetlands airboat smuggling.",
    });
  });

  it("ranks results and still enforces row level security", async () => {
    const titles = async (userId: string) =>
      asUser(db, userId, async () => {
        const r = await db.query<{ title: string }>(`select title from public.search_posts('airboat wetlands')`);
        return r.rows.map((row) => row.title);
      });

    expect(await titles(f.bob)).toHaveLength(2);
    expect(await titles(f.carol)).toEqual(["Airboat routes through the wetlands"]);
  });
});
