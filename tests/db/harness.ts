import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const shimPath = path.join(process.cwd(), "tests", "db", "supabase-shim.sql");

export type Db = PGlite;

/** Boots an empty Postgres, applies the Supabase shim, then every migration in order. */
export async function createTestDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(await readFile(shimPath, "utf8"));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Runs a callback with the request context of a signed in user, then restores it. */
export async function asUser<T>(db: Db, userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    return await run();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

/** Runs a callback as a logged out visitor. */
export async function asAnon<T>(db: Db, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: "anon" })]);
  try {
    return await run();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

export async function createUser(db: Db, email: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [email],
  );
  return result.rows[0]!.id;
}

export async function setUsername(db: Db, userId: string, username: string): Promise<void> {
  await db.query(`update public.profiles set username = $2 where id = $1`, [userId, username]);
}
