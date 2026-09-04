import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type Db } from "./harness";

describe("migrations", () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  it("creates every table with row level security enabled", async () => {
    const result = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(result.rows.map((r) => r.tablename)).toEqual([
      "admin_actions",
      "group_invites",
      "group_members",
      "groups",
      "posts",
      "profiles",
      "replies",
      "reports",
      "signup_attempts",
      "votes",
    ]);
    expect(result.rows.every((r) => r.rowsecurity)).toBe(true);
  });

  it("ships the spoiler shield off, so a new reader sees everything", async () => {
    const id = await createUser(db, "shield@example.com");
    const result = await db.query<{ spoiler_shield: boolean; progress: number }>(
      `select spoiler_shield, progress from public.profiles where id = $1`,
      [id],
    );
    expect(result.rows[0]!.spoiler_shield).toBe(false);
    expect(result.rows[0]!.progress).toBe(0);
  });

  it("lets a reader turn the shield on for themselves and nobody else", async () => {
    const mine = await createUser(db, "mine@example.com");
    const theirs = await createUser(db, "theirs@example.com");

    await asUser(db, mine, async () => {
      await db.query(`update public.profiles set spoiler_shield = true, progress = 4 where id = $1`, [mine]);

      const blocked = await db.query(`update public.profiles set spoiler_shield = true where id = $1`, [theirs]);
      expect(blocked.affectedRows).toBe(0);
    });

    const rows = await db.query<{ id: string; spoiler_shield: boolean }>(
      `select id, spoiler_shield from public.profiles where id in ($1, $2)`,
      [mine, theirs],
    );
    expect(rows.rows.find((row) => row.id === mine)!.spoiler_shield).toBe(true);
    expect(rows.rows.find((row) => row.id === theirs)!.spoiler_shield).toBe(false);
  });

  it("creates a profile when an auth user appears", async () => {
    const id = await createUser(db, "trigger@example.com");
    const result = await db.query<{ username: string; progress: number }>(
      `select username, progress from public.profiles where id = $1`,
      [id],
    );
    expect(result.rows[0]!.username).toMatch(/^player_[0-9a-f]{6}$/);
    expect(result.rows[0]!.progress).toBe(0);
  });
});
