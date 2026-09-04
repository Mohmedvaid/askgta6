import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_EMAIL_DOMAIN, emails, ids, shuffled } from "./ids";
import { renderSchemaDoc, validate } from "./schema";
import type { SeedFile } from "./types";

/**
 * Imports supabase/seed/seed.json into a Supabase project.
 *
 * Two properties hold throughout. It is idempotent: every row it writes has a
 * uuid derived from the file, so a second run updates rather than duplicates,
 * and it can be run against a half finished import without cleaning up first.
 * And it is ordered: each phase only depends on phases before it, so a failure
 * prints the phase to resume from and nothing has to be undone by hand.
 *
 * Run it with pnpm seed:import. See docs/app/seed-content.md.
 */

const ROOT = process.cwd();
const SEED_FILE = path.join(ROOT, "supabase", "seed", "seed.json");
const SCHEMA_DOC = path.join(ROOT, "supabase", "seed", "SCHEMA.md");
const CREDENTIALS_FILE = path.join(ROOT, "seed-credentials.local.json");

/**
 * The floor, not the size. One account may vote once on a given item, so an item
 * with 400 votes needs 400 voters for the count to come out exact. The pool grows
 * to whatever the file demands and never shrinks below this.
 */
const VOTER_POOL_FLOOR = 80;

const CHUNK = 500;

type Phase = "validate" | "accounts" | "voters" | "groups" | "posts" | "replies" | "accepted" | "votes" | "cleanup";

const PHASES: Phase[] = [
  "validate",
  "accounts",
  "voters",
  "groups",
  "posts",
  "replies",
  "accepted",
  "votes",
  "cleanup",
];

/** Groups seed.json can reference. Ownership goes to a seed account, never a placeholder. */
const GROUPS: Record<string, { name: string; description: string }> = {
  "vice-city-locals": {
    name: "Vice City locals",
    description: "For people who care about the streets, the signage, and where the good radio towers are.",
  },
  "first-timers": {
    name: "First-timers",
    description: "New to the series or coming back after a decade. No question is too basic in here.",
  },
};

function requireEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running pnpm seed:import.");
    process.exit(1);
  }
  return { url, key };
}

function chunk<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function log(message: string): void {
  console.log(`  ${message}`);
}

// ---------------------------------------------------------------------------
// Phase 1, validate
// ---------------------------------------------------------------------------

export function loadAndValidate(file = SEED_FILE, schemaDoc: string | null = SCHEMA_DOC): SeedFile {
  const data = JSON.parse(readFileSync(file, "utf8")) as SeedFile;
  const violations = validate(data);

  if (violations.length > 0) {
    console.error(`\n${violations.length} problem${violations.length === 1 ? "" : "s"} in ${path.basename(file)}:\n`);
    for (const violation of violations) console.error(`  ${violation.path}: ${violation.problem}`);
    console.error("\nNothing was written. Fix the file and run again.\n");
    process.exit(1);
  }

  // Written after validation, so the doc always describes a file that passed.
  if (schemaDoc) writeFileSync(schemaDoc, renderSchemaDoc(data));
  return data;
}

/** The pool has to cover the busiest item, or that item's count cannot come out right. */
export function voterPoolSize(data: SeedFile): number {
  const items = [...data.posts, ...data.replies];
  return Math.max(VOTER_POOL_FLOOR, ...items.map((item) => item.upvotes + item.downvotes));
}

// ---------------------------------------------------------------------------
// Accounts and voters
// ---------------------------------------------------------------------------

type Credential = { username: string; email: string; password: string };

/**
 * Creates an auth user at a known id, or moves an existing one's password on.
 *
 * The admin API takes an explicit id, which is what makes the whole import
 * deterministic: the profile, its posts, and its votes all hang off a uuid
 * derived from the username rather than off whatever GoTrue happened to assign.
 */
async function ensureAuthUser(
  supabase: SupabaseClient,
  id: string,
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.admin.createUser({ id, email, password, email_confirm: true });
  if (!error) return;

  const alreadyThere = /already|registered|duplicate/i.test(error.message);
  if (!alreadyThere) throw new Error(`could not create ${email}: ${error.message}`);

  // Rotate rather than leave a password nobody has a record of.
  const { error: updateError } = await supabase.auth.admin.updateUserById(id, { password });
  if (updateError) throw new Error(`could not rotate ${email}: ${updateError.message}`);
}

async function importAccounts(supabase: SupabaseClient, data: SeedFile): Promise<Credential[]> {
  const credentials: Credential[] = [];

  for (const account of data.accounts) {
    const id = ids.account(account.username);
    const email = emails.account(account.username);
    const password = randomBytes(24).toString("base64url");

    await ensureAuthUser(supabase, id, email, password);
    credentials.push({ username: account.username, email, password });
  }

  // The signup trigger writes a placeholder profile, so these are all updates.
  // created_at comes from the file: an account that posted in July has to look
  // like it joined before then.
  const rows = data.accounts.map((account) => ({
    id: ids.account(account.username),
    username: account.username,
    display_name: account.display_name,
    bio: account.bio,
    created_at: account.created_at,
    progress: 0,
    spoiler_shield: false,
  }));

  for (const batch of chunk(rows)) {
    const { error } = await supabase.from("profiles").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`could not write profiles: ${error.message}`);
  }

  log(`${data.accounts.length} accounts`);
  return credentials;
}

async function importVoters(supabase: SupabaseClient, size: number): Promise<Credential[]> {
  const credentials: Credential[] = [];

  for (let index = 0; index < size; index += 1) {
    const id = ids.voter(index);
    const email = emails.voter(index);
    const password = randomBytes(24).toString("base64url");

    await ensureAuthUser(supabase, id, email, password);
    credentials.push({ username: `voter_${String(index).padStart(4, "0")}`, email, password });
  }

  const rows = Array.from({ length: size }, (_, index) => ({
    id: ids.voter(index),
    username: `voter_${String(index).padStart(4, "0")}`,
    display_name: null,
    progress: 0,
    spoiler_shield: false,
  }));

  for (const batch of chunk(rows)) {
    const { error } = await supabase.from("profiles").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`could not write voter profiles: ${error.message}`);
  }

  log(`${size} voters`);
  return credentials;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/**
 * Ownership goes to the account that posted in the group first.
 *
 * It has to be somebody from seed.json rather than a placeholder, because
 * groups.owner_id cascades on delete: leaving a placeholder as owner means the
 * cleanup phase would take the group and every post in it along with the
 * account.
 */
async function importGroups(supabase: SupabaseClient, data: SeedFile): Promise<void> {
  const slugs = [...new Set(data.posts.map((post) => post.group).filter((slug): slug is string => Boolean(slug)))];
  if (slugs.length === 0) return;

  const rows = slugs.map((slug) => {
    const known = GROUPS[slug];
    const first = data.posts
      .filter((post) => post.group === slug)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;

    return {
      id: ids.group(slug),
      slug,
      name: known?.name ?? slug,
      description: known?.description ?? null,
      visibility: "public" as const,
      owner_id: ids.account(first.author),
      created_at: first.created_at,
    };
  });

  const { error } = await supabase.from("groups").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`could not write groups: ${error.message}`);

  // Everyone who posted in a group is a member of it, plus the owner.
  const members = new Map<string, { group_id: string; user_id: string; role: "owner" | "member" }>();
  for (const row of rows) {
    members.set(`${row.id}:${row.owner_id}`, { group_id: row.id, user_id: row.owner_id, role: "owner" });
  }
  for (const post of data.posts) {
    if (!post.group) continue;
    const key = `${ids.group(post.group)}:${ids.account(post.author)}`;
    if (members.has(key)) continue;
    members.set(key, { group_id: ids.group(post.group), user_id: ids.account(post.author), role: "member" });
  }

  for (const batch of chunk([...members.values()])) {
    const { error: memberError } = await supabase
      .from("group_members")
      .upsert(batch, { onConflict: "group_id,user_id" });
    if (memberError) throw new Error(`could not write group members: ${memberError.message}`);
  }

  log(`${rows.length} groups, ${members.size} memberships`);
}

// ---------------------------------------------------------------------------
// Posts and replies
// ---------------------------------------------------------------------------

async function importPosts(supabase: SupabaseClient, data: SeedFile): Promise<void> {
  // accepted_reply_id is left for its own phase: the reply it points at does not
  // exist yet, and the column has a foreign key.
  const rows = data.posts.map((post) => ({
    id: ids.post(post.id),
    author_id: ids.account(post.author),
    group_id: post.group ? ids.group(post.group) : null,
    topic: post.topic,
    kind: post.kind,
    title: post.title,
    body: post.body,
    spoiler_level: post.spoiler_level,
    created_at: post.created_at,
    updated_at: post.created_at,
    is_hidden: false,
  }));

  for (const batch of chunk(rows)) {
    const { error } = await supabase.from("posts").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`could not write posts: ${error.message}`);
  }

  log(`${rows.length} posts`);
}

async function importReplies(supabase: SupabaseClient, data: SeedFile): Promise<void> {
  const rows = data.replies.map((reply) => ({
    id: ids.reply(reply.id),
    post_id: ids.post(reply.post_id),
    author_id: ids.account(reply.author),
    body: reply.body,
    spoiler_level: reply.spoiler_level,
    created_at: reply.created_at,
    is_hidden: false,
  }));

  for (const batch of chunk(rows)) {
    const { error } = await supabase.from("replies").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`could not write replies: ${error.message}`);
  }

  log(`${rows.length} replies`);
}

/** Through the definer function, which is what the app uses and what checks the pairing. */
async function importAccepted(supabase: SupabaseClient, data: SeedFile): Promise<void> {
  const answered = data.posts.filter((post) => post.accepted_reply_id);

  for (const post of answered) {
    const { error } = await supabase.rpc("set_accepted_reply_admin", {
      p_post_id: ids.post(post.id),
      p_reply_id: ids.reply(post.accepted_reply_id!),
    });
    if (error) throw new Error(`could not accept a reply on ${post.id}: ${error.message}`);
  }

  log(`${answered.length} accepted answers`);
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

export type VoteRow = { user_id: string; target_type: "post" | "reply"; target_id: string; value: 1 | -1; created_at: string };

/**
 * Real vote rows, so vote_count is produced by the same trigger that maintains it
 * in production rather than written straight into the column.
 *
 * Votes are one per account per item, so an item's upvotes and downvotes are
 * dealt to distinct voters taken from a deterministically shuffled pool. The
 * timestamp lands between the item appearing and now, because a vote before the
 * thing it votes on reads as broken the moment anybody sorts by date.
 */
export function buildVotes(data: SeedFile, poolSize: number, now = Date.now()): VoteRow[] {
  const pool = Array.from({ length: poolSize }, (_, index) => ids.voter(index));
  const rows: VoteRow[] = [];

  const items: { type: "post" | "reply"; seedId: string; id: string; created_at: string; up: number; down: number }[] = [
    ...data.posts.map((post) => ({
      type: "post" as const,
      seedId: post.id,
      id: ids.post(post.id),
      created_at: post.created_at,
      up: post.upvotes,
      down: post.downvotes,
    })),
    ...data.replies.map((reply) => ({
      type: "reply" as const,
      seedId: reply.id,
      id: ids.reply(reply.id),
      created_at: reply.created_at,
      up: reply.upvotes,
      down: reply.downvotes,
    })),
  ];

  for (const item of items) {
    const wanted = item.up + item.down;
    if (wanted === 0) continue;
    if (wanted > pool.length) {
      throw new Error(
        `${item.type} ${item.seedId} needs ${wanted} distinct voters and the pool holds ${pool.length}`,
      );
    }

    const voters = shuffled(pool, `${item.type}:${item.seedId}`).slice(0, wanted);
    const start = Date.parse(item.created_at);
    const span = Math.max(1, now - start);
    const spread = shuffled(
      Array.from({ length: wanted }, (_, index) => index),
      `when:${item.type}:${item.seedId}`,
    );

    voters.forEach((voter, index) => {
      rows.push({
        user_id: voter,
        target_type: item.type,
        target_id: item.id,
        value: index < item.up ? 1 : -1,
        created_at: new Date(start + Math.floor((span * (spread[index]! + 1)) / (wanted + 1))).toISOString(),
      });
    });
  }

  return rows;
}

async function importVotes(supabase: SupabaseClient, data: SeedFile, poolSize: number): Promise<void> {
  const rows = buildVotes(data, poolSize);

  for (const batch of chunk(rows)) {
    const { error } = await supabase.from("votes").upsert(batch, { onConflict: "user_id,target_type,target_id" });
    if (error) throw new Error(`could not write votes: ${error.message}`);
  }

  log(`${rows.length} votes`);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Removes the old placeholder content, but only what nothing else needs.
 *
 * The order matters more than it looks. groups.owner_id cascades on delete, so
 * deleting a placeholder account that still owns a group would take the group and
 * every imported post in it. The group phase has already moved ownership to a
 * seed account; this refuses to delete anything if that somehow did not happen.
 */
async function cleanup(supabase: SupabaseClient, data: SeedFile): Promise<void> {
  const importedIds = new Set([
    ...data.accounts.map((account) => ids.account(account.username)),
    ...Array.from({ length: voterPoolSize(data) }, (_, index) => ids.voter(index)),
  ]);

  // Scoped to the seed email domain, and nothing else. An earlier version of this
  // matched on "any profile the import did not write", which on a live project is
  // every real person who has ever signed up. The domain is the only safe handle:
  // no real account can have one, because nobody can receive mail at it.
  const stale: { id: string; email: string }[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data: batch, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`could not list users: ${error.message}`);

    const users = batch?.users ?? [];
    for (const user of users) {
      const email = user.email ?? "";
      if (!email.endsWith(`@${SEED_EMAIL_DOMAIN}`)) continue;
      if (importedIds.has(user.id)) continue;
      stale.push({ id: user.id, email });
    }
    if (users.length < 200) break;
  }

  if (stale.length === 0) {
    log("no placeholder accounts left to remove");
    return;
  }

  const staleIds = stale.map((user) => user.id);

  // groups.owner_id cascades on delete, so a placeholder still owning a group
  // would take the group and every imported post in it. The groups phase has
  // already moved ownership to a seed account; refuse rather than assume it did.
  const { data: ownedGroups, error: groupError } = await supabase
    .from("groups")
    .select("slug, owner_id")
    .in("owner_id", staleIds);
  if (groupError) throw new Error(`could not check group ownership: ${groupError.message}`);

  if ((ownedGroups ?? []).length > 0) {
    const slugs = (ownedGroups as { slug: string }[]).map((group) => group.slug).join(", ");
    throw new Error(
      `refusing to delete: ${slugs} would cascade away with the owner. Reassign ownership, then run --from=cleanup.`,
    );
  }

  const { count: postCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .in("author_id", staleIds);
  const { count: replyCount } = await supabase
    .from("replies")
    .select("id", { count: "exact", head: true })
    .in("author_id", staleIds);

  log(`removing ${stale.length} placeholder accounts, and with them ${postCount ?? 0} posts and ${replyCount ?? 0} replies`);
  for (const user of stale) log(`  ${user.email}`);

  for (const user of stale) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`could not delete ${user.email}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

function writeCredentials(credentials: Credential[]): void {
  writeFileSync(
    CREDENTIALS_FILE,
    JSON.stringify(
      {
        note: "Written by pnpm seed:import. Gitignored. Rotated on every run, so an older copy stops working.",
        generatedAt: new Date().toISOString(),
        accounts: credentials,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  log(`credentials for ${credentials.length} accounts written to ${path.basename(CREDENTIALS_FILE)}`);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const fromArg = process.argv.find((arg) => arg.startsWith("--from="))?.split("=")[1];
  const from = (fromArg ?? "validate") as Phase;

  if (!PHASES.includes(from)) {
    console.error(`Unknown phase ${from}. One of: ${PHASES.join(", ")}`);
    process.exit(1);
  }

  const data = loadAndValidate();
  const poolSize = voterPoolSize(data);
  const { url, key } = requireEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const started = PHASES.indexOf(from);
  const shouldRun = (phase: Phase) => PHASES.indexOf(phase) >= started;
  let credentials: Credential[] = [];

  console.log(`\nImporting seed.json into ${url}`);
  console.log(`Voter pool: ${poolSize}, which is what the busiest item needs.\n`);

  const phases: [Phase, () => Promise<void>][] = [
    ["validate", async () => log(`${data.accounts.length} accounts, ${data.posts.length} posts, ${data.replies.length} replies passed`)],
    ["accounts", async () => { credentials = credentials.concat(await importAccounts(supabase, data)); }],
    ["voters", async () => { credentials = credentials.concat(await importVoters(supabase, poolSize)); }],
    ["groups", () => importGroups(supabase, data)],
    ["posts", () => importPosts(supabase, data)],
    ["replies", () => importReplies(supabase, data)],
    ["accepted", () => importAccepted(supabase, data)],
    ["votes", () => importVotes(supabase, data, poolSize)],
    ["cleanup", () => cleanup(supabase, data)],
  ];

  for (const [phase, run] of phases) {
    if (!shouldRun(phase)) continue;
    console.log(`[${phase}]`);

    try {
      await run();
    } catch (error) {
      console.error(`\n[${phase}] failed: ${(error as Error).message}`);
      console.error(`\nEvery phase before this one finished. Nothing needs undoing: rerunning\nupdates rather than duplicating. Resume with:\n`);
      console.error(`  pnpm seed:import --from=${phase}\n`);
      if (credentials.length > 0) writeCredentials(credentials);
      process.exit(1);
    }
  }

  if (credentials.length > 0) writeCredentials(credentials);
  console.log("\nDone.\n");
}

if (process.argv[1] && process.argv[1].endsWith("import.ts")) {
  void main();
}

export { SEED_EMAIL_DOMAIN, cleanup, importAccounts, importGroups, importPosts, importReplies, importVotes };
