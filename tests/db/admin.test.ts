import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, createUser, type Db } from "./harness";
import { seedFixture, type Fixture } from "./fixtures";

/**
 * Admin and banning at the SQL layer. The point of moving admin out of an
 * environment variable and into a column is that row level security can see it, so
 * these assert the database refuses a banned writer rather than the UI hiding a
 * button from them.
 */
describe("admin and bans", () => {
  let db: Db;
  let f: Fixture;
  let openPost: string;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixture(db);

    const post = await db.query<{ id: string }>(
      `insert into public.posts (author_id, topic, kind, title, body, spoiler_level)
       values ($1, 'map', 'question', 'A readable title for the tests', 'A body.', 0) returning id`,
      [f.alice],
    );
    openPost = post.rows[0]!.id;
  });

  afterAll(async () => {
    await db.close();
  });

  const ban = (id: string) =>
    db.query(`update public.profiles set banned_at = now(), banned_reason = 'testing' where id = $1`, [id]);
  const unban = (id: string) =>
    db.query(`update public.profiles set banned_at = null, banned_reason = null where id = $1`, [id]);
  const setAdmin = (id: string, value: boolean) =>
    db.query(`update public.profiles set is_admin = $2 where id = $1`, [id, value]);

  describe("is_admin", () => {
    it("is false for everyone by default", async () => {
      for (const id of [f.alice, f.bob, f.carol]) {
        await asUser(db, id, async () => {
          const result = await db.query<{ is_admin: boolean }>(`select public.is_admin() as is_admin`);
          expect(result.rows[0]!.is_admin).toBe(false);
        });
      }
    });

    it("follows the column, not a list held somewhere else", async () => {
      await setAdmin(f.alice, true);
      await asUser(db, f.alice, async () => {
        const result = await db.query<{ is_admin: boolean }>(`select public.is_admin() as is_admin`);
        expect(result.rows[0]!.is_admin).toBe(true);
      });
      await setAdmin(f.alice, false);
    });

    it("is false for a logged out visitor", async () => {
      await asAnon(db, async () => {
        const result = await db.query<{ is_admin: boolean }>(`select public.is_admin() as is_admin`);
        expect(result.rows[0]!.is_admin).toBe(false);
      });
    });

    it("cannot be granted to yourself", async () => {
      await asUser(db, f.bob, async () => {
        await expect(
          db.query(`update public.profiles set is_admin = true where id = $1`, [f.bob]),
        ).rejects.toThrow(/row-level security/);
      });

      const after = await db.query<{ is_admin: boolean }>(`select is_admin from public.profiles where id = $1`, [
        f.bob,
      ]);
      expect(after.rows[0]!.is_admin).toBe(false);
    });

    it("does not let a banned account lift its own ban", async () => {
      await db.query(`update public.profiles set banned_at = now() where id = $1`, [f.bob]);

      await asUser(db, f.bob, async () => {
        await expect(
          db.query(`update public.profiles set banned_at = null where id = $1`, [f.bob]),
        ).rejects.toThrow(/row-level security/);
      });

      const after = await db.query<{ banned_at: string | null }>(
        `select banned_at from public.profiles where id = $1`,
        [f.bob],
      );
      expect(after.rows[0]!.banned_at).not.toBeNull();

      await db.query(`update public.profiles set banned_at = null where id = $1`, [f.bob]);
    });

    it("leaves an ordinary profile edit working", async () => {
      await asUser(db, f.bob, async () => {
        await db.query(`update public.profiles set display_name = 'Bob B' where id = $1`, [f.bob]);
      });

      const after = await db.query<{ display_name: string }>(
        `select display_name from public.profiles where id = $1`,
        [f.bob],
      );
      expect(after.rows[0]!.display_name).toBe("Bob B");
    });
  });

  describe("a banned account", () => {
    beforeAll(async () => {
      await ban(f.carol);
    });

    afterAll(async () => {
      await unban(f.carol);
    });

    it("cannot post", async () => {
      await asUser(db, f.carol, async () => {
        await expect(
          db.query(
            `insert into public.posts (author_id, topic, kind, title, body, spoiler_level)
             values ($1, 'map', 'question', 'A title a banned person wrote', 'Body.', 0)`,
            [f.carol],
          ),
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("cannot reply", async () => {
      await asUser(db, f.carol, async () => {
        await expect(
          db.query(
            `insert into public.replies (post_id, author_id, body, spoiler_level) values ($1, $2, 'Body.', 0)`,
            [openPost, f.carol],
          ),
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("cannot vote, even though votes go through a definer function", async () => {
      await asUser(db, f.carol, async () => {
        await expect(
          db.query(`select public.cast_vote('post', $1, 1::smallint)`, [openPost]),
        ).rejects.toThrow(/banned/);
      });
    });

    it("cannot create a group", async () => {
      await asUser(db, f.carol, async () => {
        await expect(
          db.query(
            `insert into public.groups (owner_id, slug, name, visibility) values ($1, 'banned-room', 'Banned room', 'public')`,
            [f.carol],
          ),
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("cannot file a report", async () => {
      await asUser(db, f.carol, async () => {
        await expect(
          db.query(
            `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`,
            [f.carol, openPost],
          ),
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("cannot edit a post it already owns", async () => {
      const own = await db.query<{ id: string }>(
        `insert into public.posts (author_id, topic, kind, title, body, spoiler_level)
         values ($1, 'map', 'question', 'Written before the ban landed', 'Body.', 0) returning id`,
        [f.carol],
      );

      await asUser(db, f.carol, async () => {
        const result = await db.query(`update public.posts set title = 'Edited after the ban' where id = $1`, [
          own.rows[0]!.id,
        ]);
        // The row is invisible to the update rather than throwing, which is how a
        // failing using clause behaves. Either way nothing changes.
        expect(result.affectedRows).toBe(0);
      });
    });

    it("can still read", async () => {
      await asUser(db, f.carol, async () => {
        const result = await db.query(`select id from public.posts where id = $1`, [openPost]);
        expect(result.rows).toHaveLength(1);
      });
    });
  });

  describe("an unbanned account", () => {
    it("can post again once the ban is lifted", async () => {
      await ban(f.bob);
      await unban(f.bob);

      await asUser(db, f.bob, async () => {
        await db.query(
          `insert into public.posts (author_id, topic, kind, title, body, spoiler_level)
           values ($1, 'map', 'question', 'Posting again after an unban', 'Body.', 0)`,
          [f.bob],
        );
      });
    });
  });

  describe("the audit table", () => {
    it("is readable by an admin and by nobody else", async () => {
      await db.query(
        `insert into public.admin_actions (actor_id, action, target_type, target_id, detail)
         values ($1, 'hide', 'post', $2, '{"reason":"testing"}'::jsonb)`,
        [f.alice, openPost],
      );

      await asUser(db, f.bob, async () => {
        const result = await db.query(`select * from public.admin_actions`);
        expect(result.rows).toHaveLength(0);
      });

      await setAdmin(f.alice, true);
      await asUser(db, f.alice, async () => {
        const result = await db.query(`select * from public.admin_actions`);
        expect(result.rows).toHaveLength(1);
      });
      await setAdmin(f.alice, false);
    });

    it("takes no writes from a client, admin or not", async () => {
      await setAdmin(f.alice, true);
      await asUser(db, f.alice, async () => {
        await expect(
          db.query(
            `insert into public.admin_actions (actor_id, action, target_type) values ($1, 'ban', 'user')`,
            [f.alice],
          ),
        ).rejects.toThrow(/permission denied|row-level security/);
      });
      await setAdmin(f.alice, false);
    });

    it("only accepts actions and targets it knows", async () => {
      await expect(
        db.query(`insert into public.admin_actions (actor_id, action, target_type) values ($1, 'nuke', 'post')`, [
          f.alice,
        ]),
      ).rejects.toThrow(/admin_actions_action_check/);

      await expect(
        db.query(`insert into public.admin_actions (actor_id, action, target_type) values ($1, 'ban', 'planet')`, [
          f.alice,
        ]),
      ).rejects.toThrow(/admin_actions_target_type_check/);
    });
  });

  describe("the per IP signup limit", () => {
    it("allows five in an hour and refuses the sixth", async () => {
      const attempt = async () => {
        const result = await db.query<{ record_signup_attempt: boolean }>(
          `select public.record_signup_attempt('hash-of-one-ip') as record_signup_attempt`,
        );
        return result.rows[0]!.record_signup_attempt;
      };

      expect([await attempt(), await attempt(), await attempt(), await attempt(), await attempt()]).toEqual([
        true,
        true,
        true,
        true,
        true,
      ]);
      expect(await attempt()).toBe(false);
    });

    it("counts each address separately", async () => {
      const result = await db.query<{ ok: boolean }>(
        `select public.record_signup_attempt('hash-of-another-ip') as ok`,
      );
      expect(result.rows[0]!.ok).toBe(true);
    });

    it("keeps the table unreadable, so it is never a list of who signed up", async () => {
      await asUser(db, f.bob, async () => {
        await expect(db.query(`select * from public.signup_attempts`)).rejects.toThrow(/permission denied/);
      });
    });
  });
});

/**
 * The username cooldown lives in a trigger as well as in the action, because the
 * action is not the only thing that can reach a profile row: a client holding a
 * session can update it directly under the owner policy.
 */
describe("the username cooldown", () => {
  let db: Db;
  let f: Fixture;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixture(db);
  });

  afterAll(async () => {
    await db.close();
  });

  /**
   * As a signed in owner. A bare update runs with no JWT, which the trigger reads
   * as the service role and exempts, so the cooldown has to be exercised the way a
   * person would actually hit it.
   */
  const rename = (id: string, name: string) =>
    asUser(db, id, () => db.query(`update public.profiles set username = $2 where id = $1`, [id, name]));

  it("stamps username_changed_at on a change", async () => {
    await rename(f.alice, "alice_two");

    const after = await db.query<{ username_changed_at: string | null }>(
      `select username_changed_at from public.profiles where id = $1`,
      [f.alice],
    );
    expect(after.rows[0]!.username_changed_at).not.toBeNull();
  });

  it("refuses a second change inside thirty days", async () => {
    await expect(rename(f.alice, "alice_three")).rejects.toThrow(/username changed too recently/);
  });

  it("allows it again once the cooldown has passed", async () => {
    await db.query(`update public.profiles set username_changed_at = now() - interval '31 days' where id = $1`, [
      f.alice,
    ]);

    await rename(f.alice, "alice_three");
    const after = await db.query<{ username: string }>(`select username from public.profiles where id = $1`, [
      f.alice,
    ]);
    expect(after.rows[0]!.username).toBe("alice_three");
  });

  it("frees the old name immediately, rather than reserving it", async () => {
    await db.query(`update public.profiles set username_changed_at = null where id = $1`, [f.carol]);
    // "alice" was released by the rename above and is takeable straight away.
    await rename(f.carol, "alice");

    const after = await db.query<{ username: string }>(`select username from public.profiles where id = $1`, [
      f.carol,
    ]);
    expect(after.rows[0]!.username).toBe("alice");
  });

  it("does not start the clock on the first change away from a generated name", async () => {
    const fresh = await createUser(db, "fresh@example.com");
    await db.query(`update public.profiles set username = $2, username_changed_at = null where id = $1`, [
      fresh,
      "player_abc123",
    ]);

    await rename(fresh, "chosen_name");

    // Still null, so a name typed in a hurry at onboarding gets one free fix.
    const after = await db.query<{ username_changed_at: string | null }>(
      `select username_changed_at from public.profiles where id = $1`,
      [fresh],
    );
    expect(after.rows[0]!.username_changed_at).toBeNull();

    await rename(fresh, "chosen_again");
    await expect(rename(fresh, "chosen_a_third_time")).rejects.toThrow(/username changed too recently/);
  });

  it("does not hold the service role to it, which is how an admin rename lands", async () => {
    // adminEditProfile writes with the service role key, so there is no session and
    // no auth.uid(). Without the exemption an admin could not rename the accounts
    // that most need renaming: the ones that just changed their name.
    await db.query(`update public.profiles set username = 'bob_two' where id = $1`, [f.bob]);
    await db.query(`update public.profiles set username = 'bob_three' where id = $1`, [f.bob]);

    const after = await db.query<{ username: string }>(`select username from public.profiles where id = $1`, [f.bob]);
    expect(after.rows[0]!.username).toBe("bob_three");
  });

  it("leaves an edit that does not touch the username alone", async () => {
    await asUser(db, f.alice, () =>
      db.query(`update public.profiles set display_name = 'Alice A' where id = $1`, [f.alice]),
    );

    const after = await db.query<{ display_name: string }>(
      `select display_name from public.profiles where id = $1`,
      [f.alice],
    );
    expect(after.rows[0]!.display_name).toBe("Alice A");
  });
});

describe("the bio", () => {
  let db: Db;
  let f: Fixture;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixture(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("accepts 200 characters and refuses 201", async () => {
    await db.query(`update public.profiles set bio = $2 where id = $1`, [f.alice, "a".repeat(200)]);

    await expect(
      db.query(`update public.profiles set bio = $2 where id = $1`, [f.alice, "a".repeat(201)]),
    ).rejects.toThrow(/profiles_bio_length_check/);
  });

  it("accepts null, because a bio is optional", async () => {
    await db.query(`update public.profiles set bio = null where id = $1`, [f.alice]);
  });
});

describe("the spam lists", () => {
  let db: Db;
  let f: Fixture;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixture(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("ship seeded with shorteners, paste sites, and scam bait", async () => {
    const domains = await db.query<{ domain: string }>(`select domain from public.blocked_domains`);
    const phrases = await db.query<{ phrase: string }>(`select phrase from public.blocked_phrases`);

    expect(domains.rows.map((r) => r.domain)).toEqual(expect.arrayContaining(["bit.ly", "pastebin.com"]));
    expect(phrases.rows.map((r) => r.phrase)).toEqual(
      expect.arrayContaining(["free money", "free nitro", "dm me", "telegram", "whatsapp", "crypto pump"]),
    );
  });

  it("are readable by an admin and by nobody else", async () => {
    await asUser(db, f.bob, async () => {
      const result = await db.query(`select * from public.blocked_domains`);
      expect(result.rows).toHaveLength(0);
    });

    await db.query(`update public.profiles set is_admin = true where id = $1`, [f.alice]);
    await asUser(db, f.alice, async () => {
      const result = await db.query(`select * from public.blocked_domains`);
      expect(result.rows.length).toBeGreaterThan(0);
    });
    await db.query(`update public.profiles set is_admin = false where id = $1`, [f.alice]);
  });

  it("take no writes from a client, admin or not", async () => {
    await db.query(`update public.profiles set is_admin = true where id = $1`, [f.alice]);
    await asUser(db, f.alice, async () => {
      await expect(
        db.query(`insert into public.blocked_domains (domain) values ('evil.test')`),
      ).rejects.toThrow(/permission denied|row-level security/);
    });
    await db.query(`update public.profiles set is_admin = false where id = $1`, [f.alice]);
  });

  it("hold each entry once", async () => {
    await expect(db.query(`insert into public.blocked_domains (domain) values ('bit.ly')`)).rejects.toThrow(
      /duplicate key/,
    );
  });
});

describe("link_privilege_stats", () => {
  let db: Db;
  let f: Fixture;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixture(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("counts accepted answers and upvotes received across posts and replies", async () => {
    const post = await db.query<{ id: string }>(
      `insert into public.posts (author_id, topic, kind, title, body, spoiler_level, vote_count)
       values ($1, 'map', 'question', 'A title long enough to pass', 'Body.', 0, 4) returning id`,
      [f.alice],
    );
    const reply = await db.query<{ id: string }>(
      `insert into public.replies (post_id, author_id, body, spoiler_level, vote_count)
       values ($1, $2, 'An answer.', 0, 2) returning id`,
      [post.rows[0]!.id, f.bob],
    );
    await db.query(`select public.set_accepted_reply_admin($1, $2)`, [post.rows[0]!.id, reply.rows[0]!.id]);

    const alice = await db.query<{ accepted_answers: string; upvotes_received: string }>(
      `select * from public.link_privilege_stats($1)`,
      [f.alice],
    );
    expect(Number(alice.rows[0]!.accepted_answers)).toBe(0);
    expect(Number(alice.rows[0]!.upvotes_received)).toBe(4);

    const bob = await db.query<{ accepted_answers: string; upvotes_received: string }>(
      `select * from public.link_privilege_stats($1)`,
      [f.bob],
    );
    expect(Number(bob.rows[0]!.accepted_answers)).toBe(1);
    expect(Number(bob.rows[0]!.upvotes_received)).toBe(2);
  });

  it("is zero for an account that has written nothing", async () => {
    const result = await db.query<{ accepted_answers: string; upvotes_received: string }>(
      `select * from public.link_privilege_stats($1)`,
      [f.carol],
    );
    expect(Number(result.rows[0]!.accepted_answers)).toBe(0);
    expect(Number(result.rows[0]!.upvotes_received)).toBe(0);
  });
});
