import { createUser, setUsername, type Db } from "./harness";

export type Fixture = {
  alice: string;
  bob: string;
  carol: string;
  publicGroup: string;
  privateGroup: string;
  inviteCode: string;
};

/** Two groups, three people, and one invite code, enough for every access test. */
export async function seedFixture(db: Db): Promise<Fixture> {
  const alice = await createUser(db, "alice@example.com");
  const bob = await createUser(db, "bob@example.com");
  const carol = await createUser(db, "carol@example.com");
  await setUsername(db, alice, "alice");
  await setUsername(db, bob, "bob");
  await setUsername(db, carol, "carol");

  const publicGroup = await createGroup(db, alice, "vice-city-locals", "Vice City locals", "public");
  const privateGroup = await createGroup(db, alice, "night-shift", "Night shift", "private");

  await db.query(
    `insert into public.group_members (group_id, user_id, role) values ($1, $2, 'member')`,
    [publicGroup, bob],
  );
  await db.query(
    `insert into public.group_members (group_id, user_id, role) values ($1, $2, 'member')`,
    [privateGroup, bob],
  );

  const inviteCode = "NIGHT01";
  await db.query(
    `insert into public.group_invites (group_id, code, created_by) values ($1, $2, $3)`,
    [privateGroup, inviteCode, alice],
  );

  return { alice, bob, carol, publicGroup, privateGroup, inviteCode };
}

export async function createGroup(
  db: Db,
  ownerId: string,
  slug: string,
  name: string,
  visibility: "public" | "private",
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.groups (slug, name, visibility, owner_id) values ($1, $2, $3, $4) returning id`,
    [slug, name, visibility, ownerId],
  );
  return result.rows[0]!.id;
}

export async function createPost(
  db: Db,
  authorId: string,
  overrides: Partial<{
    groupId: string | null;
    topic: string;
    kind: string;
    title: string;
    body: string;
    spoilerLevel: number;
  }> = {},
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.posts (author_id, group_id, topic, kind, title, body, spoiler_level)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      authorId,
      overrides.groupId ?? null,
      overrides.topic ?? "general",
      overrides.kind ?? "question",
      overrides.title ?? "A question about the Leonida map",
      overrides.body ?? "How big do we think the map actually is compared to Los Santos.",
      overrides.spoilerLevel ?? 0,
    ],
  );
  return result.rows[0]!.id;
}

export async function createReply(db: Db, postId: string, authorId: string, body = "A reply body."): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.replies (post_id, author_id, body) values ($1, $2, $3) returning id`,
    [postId, authorId, body],
  );
  return result.rows[0]!.id;
}
