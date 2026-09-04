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

/**
 * The groups this import owns, and the shape it wants them in.
 *
 * A slug not listed here still gets a group if a post references it, named after
 * the slug. A slug listed here but referenced by nothing still gets one, which is
 * how the private group survives: seed.json has no posts in it, but the project
 * already has the group and an owner who is about to be deleted.
 */
const GROUPS: Record<string, { name: string; description: string; visibility: "public" | "private"; owner?: string }> = {
  "vice-city-locals": {
    name: "Vice City locals",
    description: "For people who care about the streets, the signage, and where the good radio towers are.",
    visibility: "public",
  },
  "first-timers": {
    name: "First-timers",
    description: "New to the series or coming back after a decade. No question is too basic in here.",
    visibility: "public",
  },
  "night-shift": {
    name: "Night shift",
    description: "A small crew that plays after midnight and posts about it. Invite only.",
    visibility: "private",
    owner: "neonlightsvc",
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

type ManagedGroup = {
  slug: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  owner_id: string;
  created_at: string | null;
};

/**
 * Ownership goes to the account that posted in the group first, or to the owner
 * named in GROUPS for a group nothing posts in.
 *
 * It has to be somebody from seed.json rather than a placeholder, because
 * groups.owner_id cascades on delete: leaving a placeholder as owner means the
 * cleanup phase would take the group and every post in it along with the account.
 */
function managedGroups(data: SeedFile): ManagedGroup[] {
  const referenced = [...new Set(data.posts.map((post) => post.group).filter((slug): slug is string => Boolean(slug)))];

  return [...new Set([...referenced, ...Object.keys(GROUPS)])]
    .map((slug) => {
      const known = GROUPS[slug];
      const first = data.posts
        .filter((post) => post.group === slug)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

      return { slug, known, first, owner: first?.author ?? known?.owner };
    })
    // A group nothing posts in and nobody is named to own is not this import's to manage.
    .filter((candidate): candidate is typeof candidate & { owner: string } => Boolean(candidate.owner))
    .map(({ slug, known, first, owner }) => ({
      slug,
      name: known?.name ?? slug,
      description: known?.description ?? null,
      visibility: known?.visibility ?? "public",
      owner_id: ids.account(owner),
      created_at: first?.created_at ?? null,
    }));
}

/** Reads the ids the project already uses for these slugs. Missing slugs are simply absent. */
async function resolveGroups(supabase: SupabaseClient, slugs: readonly string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();

  const { data, error } = await supabase.from("groups").select("id, slug").in("slug", slugs);
  if (error) throw new Error(`could not read groups: ${error.message}`);

  return new Map((data as { id: string; slug: string }[] | null ?? []).map((row) => [row.slug, row.id]));
}

/**
 * Adopts the groups that exist and creates the ones that do not.
 *
 * Slug is a group's identity here, not its uuid. A project that ran the earlier
 * placeholder seed already holds these slugs under ids nobody can derive, and
 * slug is unique, so writing an id of our own is a duplicate key rather than an
 * update. An existing row keeps its id and its created_at, and takes the seed's
 * name, description, and owner; only a slug the project has never seen gets an
 * id from the namespace. Returns slug to id, because everything downstream has
 * to point at whatever id the group turned out to have.
 */
async function importGroups(supabase: SupabaseClient, data: SeedFile): Promise<Map<string, string>> {
  const wanted = managedGroups(data);
  if (wanted.length === 0) return new Map();

  const bySlug = await resolveGroups(supabase, wanted.map((group) => group.slug));
  let adopted = 0;
  let created = 0;

  for (const group of wanted) {
    const existing = bySlug.get(group.slug);

    if (existing) {
      const { error } = await supabase
        .from("groups")
        .update({ name: group.name, description: group.description, owner_id: group.owner_id })
        .eq("id", existing);
      if (error) throw new Error(`could not adopt ${group.slug}: ${error.message}`);
      adopted += 1;
      continue;
    }

    const id = ids.group(group.slug);
    const { error } = await supabase.from("groups").insert({
      id,
      slug: group.slug,
      name: group.name,
      description: group.description,
      visibility: group.visibility,
      owner_id: group.owner_id,
      ...(group.created_at ? { created_at: group.created_at } : {}),
    });
    if (error) throw new Error(`could not create ${group.slug}: ${error.message}`);

    bySlug.set(group.slug, id);
    created += 1;
  }

  // Everyone who posted in a group is a member of it, plus the owner.
  const members = new Map<string, { group_id: string; user_id: string; role: "owner" | "member" }>();
  for (const group of wanted) {
    const id = bySlug.get(group.slug)!;
    members.set(`${id}:${group.owner_id}`, { group_id: id, user_id: group.owner_id, role: "owner" });
  }
  for (const post of data.posts) {
    if (!post.group) continue;
    const id = bySlug.get(post.group)!;
    const key = `${id}:${ids.account(post.author)}`;
    if (members.has(key)) continue;
    members.set(key, { group_id: id, user_id: ids.account(post.author), role: "member" });
  }

  for (const batch of chunk([...members.values()])) {
    const { error: memberError } = await supabase
      .from("group_members")
      .upsert(batch, { onConflict: "group_id,user_id" });
    if (memberError) throw new Error(`could not write group members: ${memberError.message}`);
  }

  log(`${adopted} groups adopted, ${created} created, ${members.size} memberships`);
  return bySlug;
}

// ---------------------------------------------------------------------------
// Posts and replies
// ---------------------------------------------------------------------------

/**
 * The group map is passed in when the groups phase just ran, and read back from
 * the database when it did not, so --from=posts lands on the same ids.
 */
async function importPosts(
  supabase: SupabaseClient,
  data: SeedFile,
  groupIds?: Map<string, string>,
): Promise<void> {
  const referenced = [...new Set(data.posts.map((post) => post.group).filter((slug): slug is string => Boolean(slug)))];
  const bySlug = groupIds ?? (await resolveGroups(supabase, referenced));

  const groupId = (slug: string): string => {
    const id = bySlug.get(slug);
    if (!id) throw new Error(`no group with slug ${slug}. Run pnpm seed:import --from=groups first.`);
    return id;
  };

  // accepted_reply_id is left for its own phase: the reply it points at does not
  // exist yet, and the column has a foreign key.
  const rows = data.posts.map((post) => ({
    id: ids.post(post.id),
    author_id: ids.account(post.author),
    group_id: post.group ? groupId(post.group) : null,
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
  let groupIds = new Map<string, string>();

  console.log(`\nImporting seed.json into ${url}`);
  console.log(`Voter pool: ${poolSize}, which is what the busiest item needs.\n`);

  const phases: [Phase, () => Promise<void>][] = [
    ["validate", async () => log(`${data.accounts.length} accounts, ${data.posts.length} posts, ${data.replies.length} replies passed`)],
    ["accounts", async () => { credentials = credentials.concat(await importAccounts(supabase, data)); }],
    ["voters", async () => { credentials = credentials.concat(await importVoters(supabase, poolSize)); }],
    ["groups", async () => { groupIds = await importGroups(supabase, data); }],
    ["posts", () => importPosts(supabase, data, groupIds.size > 0 ? groupIds : undefined)],
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

export { SEED_EMAIL_DOMAIN, cleanup, importAccounts, importGroups, importPosts, importReplies, importVotes, managedGroups, resolveGroups };
