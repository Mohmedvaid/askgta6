import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Db } from "./harness";

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
      "group_invites",
      "group_members",
      "groups",
      "posts",
      "profiles",
      "replies",
      "reports",
      "votes",
    ]);
    expect(result.rows.every((r) => r.rowsecurity)).toBe(true);
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
