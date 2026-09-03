# Status

What is verified, how, and what is still unproven. Written 2026-09-03.

## The blocker, stated first

The build container cannot reach the Supabase project. Every host is refused by the egress proxy's organization policy, not by a missing credential:

```
hxljpyqwhdhxkcasmgut.supabase.co:443  connect_rejected (organization policy)
api.supabase.com:443                  connect_rejected
supabase.com:443                      connect_rejected
db.<ref>.supabase.co:5432             DNS does not resolve
aws-0/1-us-east-1.pooler.supabase.com:6543   connection timed out
```

`registry.npmjs.org` returns 200 from the same shell, so this is a per host policy, not a broken network. Credentials were present and correct in the environment (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`); `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` were not set, though the ref is derivable from the URL and the CLI accepts `--db-url` without an access token.

The consequence: **migration 0010 has not been applied to the project, nothing has been exercised against real Supabase, and the Auth settings have not been changed.** Three commands below finish it from a machine with network access.

## Verified in this container

**Unit and component suite, 307 tests, `pnpm test`**

- The gate keeps title, topic, kind, author, counts, and timestamp on a sealed item and removes only the body, at every one of the 64 reader and item level combinations.
- A one character body and a nine thousand character body serialize identically, so no length leaks.
- Body redaction runs at any depth: an embedded row cannot smuggle prose into a sealed item's payload. An embedded title now survives on purpose.
- `askgta6_progress` parsing: valid levels, clamping past 7, and null for absent, empty, `three`, `-1`, `2.5`, and `<script>`.
- The cookie is written with `path=/`, `SameSite=Lax`, and a one year `maxAge`.
- `getViewerProgress` returns the profile level for a signed in reader, the cookie level for a guest, and 0 for a visitor who has never answered.
- `needsProgressPrompt` is true only for a guest with no cookie, and false once any level is recorded including an explicit 0.
- `setProgress` writes the cookie and never touches the database for a logged out reader, and still rejects a level outside the list.
- `dismissProgressPrompt` records 0.
- `adoptAnonymousProgress` copies the cookie onto the new profile and clears it, copies an explicit 0 too, does nothing with no cookie, and leaves the cookie in place when the update fails.
- Every server action's returned result, including the text each database error maps to.
- Indexing: the robots directive with the flag off and on, and the permanent noindex list holding either way.

**Database suite, 39 tests, `pnpm test:db`**

Runs against Postgres in WebAssembly through pglite, applying `tests/db/supabase-shim.sql` then every migration in order, **including 0010**. So the new migration is proved to apply cleanly and to accept `spoiler_in_title` while still rejecting an unknown reason. That is a real check of the SQL; it is not a check that it has been applied to your project.

Also proved there: RLS keeps private group posts invisible through select, search, and counts; clients cannot write `vote_count`, `reply_count`, `is_hidden`, or `accepted_reply_id`; report auto hide fires at exactly five distinct reporters.

**Playwright, 34 tests across desktop and mobile, `pnpm test:e2e`**

Against a production build with the real anon key configured but the project unreachable, so server reads return empty and these cover the shell and the cookie path rather than content:

- The one time sheet opens on a first visit and asks the question.
- Saving level 5 writes `askgta6_progress=5` with `SameSite=Lax` and an expiry over 360 days out, read back from the real browser jar.
- Walking away writes `0`, and a reload does not ask again.
- A returning reader gets no sheet; the mobile trigger reopens it and names their level; the trigger is hidden on desktop where the right column carries the control.
- On the landing demo every title stays readable at level 0 while the bodies seal, and the sealed ones say which chapter they open at.
- The rail becomes a bottom bar, and nothing overflows horizontally at 1440, 1024, 768, or 390.

**Coverage:** 91.8% lines, 86.1% branches. Threshold 80, enforced.

## Not verified

Nothing in this list is known broken. It is untested against the live project.

| Area | Why it matters |
| --- | --- |
| Migration 0010 applied | Until it is, a report with reason `spoiler_in_title` is rejected by the old check constraint and the report dialog's first option fails. |
| Auth round trip | Sign up, email confirmation, magic link, and the `/auth/callback` code exchange have never run against real GoTrue. |
| Cookie adoption on signup | `adoptAnonymousProgress` is unit tested against a fake client. The real path also depends on the profile row existing when it runs, which is the signup trigger's job. |
| Storage | Avatar upload to the `avatars` bucket, and whether migration 0007 created the bucket in your project or was skipped. |
| RLS against real PostgREST | The pglite suite exercises the same SQL, but PostgREST embeds and the `search_posts` RPC have not been called over HTTP. |
| Feed with real content | Every Playwright assertion about posts ran against an empty feed. |
| Vercel Analytics | The script is mounted but has never had a reachable endpoint. |

## Finish it from a machine with network access

```bash
git pull
pnpm install

# 1. Apply migration 0010.
export SUPABASE_ACCESS_TOKEN=<from Supabase, Account, Access Tokens>
pnpm exec supabase link --project-ref hxljpyqwhdhxkcasmgut
pnpm supabase:push

# 2. Run the suite against the live project.
pnpm build && pnpm test:e2e
```

If `supabase link` is inconvenient, `pnpm exec supabase db push --db-url "postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.hxljpyqwhdhxkcasmgut.supabase.co:5432/postgres"` needs no access token.

## The Auth settings, by hand

The management API needs `SUPABASE_ACCESS_TOKEN` and `api.supabase.com`, neither of which this container has. Set these in the dashboard:

1. Open https://supabase.com/dashboard/project/hxljpyqwhdhxkcasmgut/auth/url-configuration
2. **Site URL**: `http://localhost:3000`
3. **Redirect URLs**, click Add URL: `http://localhost:3000/auth/callback`
4. Save.

Add your production origin and its `/auth/callback` to the same two fields before deploying. Without them, magic links and email confirmations bounce.

The equivalent management API call, once you have a token and can reach the host:

```bash
curl -X PATCH https://api.supabase.com/v1/projects/hxljpyqwhdhxkcasmgut/config/auth \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"site_url":"http://localhost:3000","uri_allow_list":"http://localhost:3000/auth/callback"}'
```

## Local files

- `.env.local` holds the real project URL, anon key, and service role key, with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and `NEXT_PUBLIC_INDEXING=off`. Mode 600, gitignored.
- `seed-credentials.local.json` does not exist yet: the seed has not been run from here. `pnpm seed` writes it.
