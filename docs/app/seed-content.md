# Seed content

The forum ships with real looking content so a visitor on day one does not land on
an empty page. It lives in `supabase/seed/seed.json`, and
`supabase/seed/import.ts` puts it into a project.

- **What is in the file, and the rules it has to satisfy:** [../../supabase/seed/SCHEMA.md](../../supabase/seed/SCHEMA.md), rewritten on every run.
- **Who the accounts are meant to sound like:** [seed-personas.md](seed-personas.md).

## Run it

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY='<secret key>' \
pnpm seed:import
```

The secret key is at **Project Settings, API Keys**. It bypasses row level
security, which is why nothing but this script and the admin actions may hold it.

It prints what it is doing per phase and finishes in a couple of minutes, most of
it spent on vote rows.

## What it does, in order

| Phase | What it writes |
| --- | --- |
| `validate` | Nothing. Reads the file, checks every rule, rewrites `SCHEMA.md`. |
| `accounts` | An auth user and a profile per account in the file. |
| `voters` | The synthetic voter pool. They never post. |
| `groups` | Any group the posts reference, plus the private group, plus memberships. |
| `posts` | Every post, with its original `created_at`. |
| `replies` | Every reply, same. |
| `accepted` | Links each accepted answer, once its reply exists. |
| `votes` | Real vote rows, which the existing trigger turns into `vote_count`. |
| `cleanup` | Removes leftover placeholder accounts and their content. |

## When it fails

Nothing needs undoing. Every row it writes has an id derived from the file rather
than from the clock, so running it again updates what is there instead of adding a
second copy. On a failure it prints the phase and the command to resume:

```bash
pnpm seed:import --from=votes
```

Re-running from the start is always safe too, and slower.

## Three things worth knowing

**Groups are matched by slug, not by id.** A project that has run an earlier seed
already holds these slugs under ids nobody can derive, and `slug` is unique, so a
group that is already there is adopted: it keeps its id and its `created_at`, and
takes the seed's name, description, and owner. Only a slug the project has never
seen gets a fresh id. Everything downstream points at whatever id the group turned
out to have, including `--from=posts`, which reads the ids back rather than
assuming them. Ownership always lands on an account from `seed.json`, because
`groups.owner_id` cascades on delete and the `cleanup` phase deletes the old
placeholder accounts.

**Passwords are rotated on every run.** They are written once to
`seed-credentials.local.json` in the repository root, mode 600 and gitignored. An
older copy stops working. Nothing prints them to the terminal.

**The voter pool is as big as the busiest item.** One account may vote once on a
given item, so a post with 400 votes needs 400 voters for the count to come out
exact. The pool is sized from the file with a floor of 80, which for the current
file means 414 accounts. They hold no content and never post, but they do count
toward the account total on the admin overview. If that matters more than exact
counts, lower `VOTER_POOL_FLOOR` in `import.ts` and cap the pool, and the vote
builder will refuse rather than write a wrong number.

## Adding content later

Append to the arrays in `seed.json` and run the import again. Existing rows update
in place, new ones are added, and nothing is duplicated.

Three rules the validator enforces, and one it cannot:

- Post and reply ids have to be unique **within the file**, and they are what the
  database uuid is derived from. Reusing an id from an earlier batch overwrites
  that row rather than adding one.
- `author` and `post_id` must name something in the same file.
- `accepted_reply_id` must be a reply on that post, and only a question may have
  one.

The one it cannot check is tone. Read [seed-personas.md](seed-personas.md) before
writing for an existing account.

## Removing it before launch

Deciding what happens to seed content is on [the backlog](../BACKLOG.md). To take
it all out, delete the accounts in **Authentication, Users**: posts, replies, and
votes cascade with their author. The voter accounts are the ones named
`voter_0000` upward.
