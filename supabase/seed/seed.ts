import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_GROUPS, SEED_USERS, buildPosts, replyBodies } from "./content";
import { avatarSvg } from "./avatars";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running pnpm seed.");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CREDENTIALS_FILE = path.join(process.cwd(), "seed-credentials.local.json");

/** A fresh password per account, per run. Printed once, then written to a gitignored file. */
function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

/** Deterministic so a reseed produces the same votes and the Top tab stays stable. */
function pseudoRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

async function ensureUsers(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const credentials: { username: string; email: string; password: string }[] = [];
  const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });

  for (const user of SEED_USERS) {
    const password = generatePassword();
    const found = existing?.users.find((candidate) => candidate.email === user.email);

    if (found) {
      // The account is already there, so rotate its password rather than leaving
      // an old one lying around that nobody has a record of.
      const { error } = await supabase.auth.admin.updateUserById(found.id, { password });
      if (error) throw new Error(`could not rotate the password for ${user.email}: ${error.message}`);
      ids.set(user.key, found.id);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`could not create ${user.email}: ${error?.message}`);
      ids.set(user.key, data.user.id);
    }

    credentials.push({ username: user.username, email: user.email, password });
  }

  writeCredentials(credentials);

  for (const user of SEED_USERS) {
    const id = ids.get(user.key)!;
    const avatarPath = `${id}/avatar.svg`;
    await supabase.storage
      .from("avatars")
      .upload(avatarPath, new Blob([avatarSvg(user.username)], { type: "image/svg+xml" }), {
        upsert: true,
        contentType: "image/svg+xml",
      });

    await supabase
      .from("profiles")
      .update({
        username: user.username,
        display_name: user.displayName,
        progress: user.progress,
        avatar_path: avatarPath,
      })
      .eq("id", id);
  }

  return ids;
}

async function ensureGroups(userIds: Map<string, string>): Promise<Map<string, string>> {
  const groupIds = new Map<string, string>();

  for (const group of SEED_GROUPS) {
    const { data: existing } = await supabase.from("groups").select("id").eq("slug", group.slug).maybeSingle();
    if (existing) {
      groupIds.set(group.slug, existing.id);
      continue;
    }

    const { data, error } = await supabase
      .from("groups")
      .insert({
        slug: group.slug,
        name: group.name,
        description: group.description,
        visibility: group.visibility,
        owner_id: userIds.get(group.ownerKey)!,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(`could not create group ${group.slug}: ${error?.message}`);
    groupIds.set(group.slug, data.id);
  }

  for (const group of SEED_GROUPS) {
    const groupId = groupIds.get(group.slug)!;
    const members = group.visibility === "private" ? ["wes", "june"] : SEED_USERS.map((user) => user.key);
    for (const key of members) {
      await supabase
        .from("group_members")
        .upsert({ group_id: groupId, user_id: userIds.get(key)!, role: "member" }, { onConflict: "group_id,user_id" });
    }
  }

  const nightShift = groupIds.get("night-shift")!;
  const { data: invite } = await supabase.from("group_invites").select("code").eq("group_id", nightShift).maybeSingle();
  if (invite) {
    console.log(`Night shift invite code: ${invite.code}`);
  } else {
    const code = "NIGHTRUN";
    await supabase.from("group_invites").insert({
      group_id: nightShift,
      code,
      created_by: userIds.get("wes")!,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    console.log(`Night shift invite code: ${code}`);
  }

  return groupIds;
}

async function seedContent(userIds: Map<string, string>, groupIds: Map<string, string>): Promise<void> {
  const { count } = await supabase.from("posts").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 20) {
    console.log(`${count} posts already present, skipping content seed.`);
    return;
  }

  const random = pseudoRandom(20261119);
  const userKeys = SEED_USERS.map((user) => user.key);
  const groupSlugs = [...groupIds.keys()];
  const posts = buildPosts();
  const bodies = replyBodies();

  const postRows = posts.map((post, index) => {
    const authorKey = userKeys[index % userKeys.length]!;
    const inGroup = index % 6 === 0;
    const daysAgo = Math.floor(random() * 30);
    return {
      author_id: userIds.get(authorKey)!,
      group_id: inGroup ? groupIds.get(groupSlugs[index % groupSlugs.length]!)! : null,
      topic: post.topic,
      kind: post.kind,
      title: post.title,
      body: post.body,
      spoiler_level: post.level ?? 0,
      created_at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - index * 60_000).toISOString(),
    };
  });

  const inserted: { id: string; author_id: string }[] = [];
  for (let start = 0; start < postRows.length; start += 50) {
    const { data, error } = await supabase
      .from("posts")
      .insert(postRows.slice(start, start + 50))
      .select("id, author_id");
    if (error) throw new Error(`could not insert posts: ${error.message}`);
    inserted.push(...(data ?? []));
  }
  console.log(`Inserted ${inserted.length} posts.`);

  const replyRows: { post_id: string; author_id: string; body: string; created_at: string }[] = [];
  for (const [index, post] of inserted.entries()) {
    const replyCount = 1 + Math.floor(random() * 4);
    for (let n = 0; n < replyCount; n += 1) {
      const authorKey = userKeys[(index + n + 1) % userKeys.length]!;
      replyRows.push({
        post_id: post.id,
        author_id: userIds.get(authorKey)!,
        body: bodies[(index * 3 + n) % bodies.length]!,
        created_at: new Date(Date.now() - Math.floor(random() * 20) * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  const insertedReplies: { id: string; post_id: string }[] = [];
  for (let start = 0; start < replyRows.length; start += 100) {
    const { data, error } = await supabase
      .from("replies")
      .insert(replyRows.slice(start, start + 100))
      .select("id, post_id");
    if (error) throw new Error(`could not insert replies: ${error.message}`);
    insertedReplies.push(...(data ?? []));
  }
  console.log(`Inserted ${insertedReplies.length} replies.`);

  const votes: { user_id: string; target_type: string; target_id: string; value: number }[] = [];
  for (const [index, post] of inserted.entries()) {
    for (const key of userKeys) {
      if (userIds.get(key) === post.author_id) continue;
      if (random() > 0.55) continue;
      votes.push({
        user_id: userIds.get(key)!,
        target_type: "post",
        target_id: post.id,
        value: random() > 0.15 ? 1 : -1,
      });
    }
    if (index % 4 === 0) {
      const reply = insertedReplies.find((candidate) => candidate.post_id === post.id);
      if (reply) {
        votes.push({
          user_id: userIds.get(userKeys[index % userKeys.length]!)!,
          target_type: "reply",
          target_id: reply.id,
          value: 1,
        });
      }
    }
  }

  for (let start = 0; start < votes.length; start += 200) {
    const { error } = await supabase
      .from("votes")
      .upsert(votes.slice(start, start + 200), { onConflict: "user_id,target_type,target_id" });
    if (error) throw new Error(`could not insert votes: ${error.message}`);
  }
  console.log(`Inserted ${votes.length} votes.`);

  let accepted = 0;
  for (const [index, post] of inserted.entries()) {
    if (index % 5 !== 0) continue;
    const reply = insertedReplies.find((candidate) => candidate.post_id === post.id);
    if (!reply) continue;
    const { error } = await supabase.rpc("set_accepted_reply_admin", {
      p_post_id: post.id,
      p_reply_id: reply.id,
    });
    if (!error) accepted += 1;
  }
  console.log(`Marked ${accepted} accepted answers.`);
}

function writeCredentials(credentials: { username: string; email: string; password: string }[]): void {
  writeFileSync(
    CREDENTIALS_FILE,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), accounts: credentials }, null, 2)}\n`,
    { mode: 0o600 },
  );

  console.log("\nSeed account passwords, shown once. They are also in seed-credentials.local.json, which is gitignored.");
  for (const account of credentials) {
    console.log(`  ${account.email}  ${account.password}`);
  }
  console.log("");
}

async function main(): Promise<void> {
  const userIds = await ensureUsers();
  const groupIds = await ensureGroups(userIds);
  await seedContent(userIds, groupIds);
  console.log("Seed complete.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
