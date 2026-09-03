# Status

What is verified, how, and what is still unproven. Updated 2026-09-03, after the spoiler shield became opt in.

## The blocker, stated first

The build container still cannot reach the Supabase project. Every host is refused by the egress proxy's organization policy, not by a missing credential:

```
hxljpyqwhdhxkcasmgut.supabase.co:443   connect_rejected (gateway answered 403 to CONNECT)
db.<ref>.supabase.co:5432              DNS does not resolve
api.supabase.com:443                   connect_rejected
```

`registry.npmjs.org` returns 200 from the same shell. `SUPABASE_ACCESS_TOKEN` is also not set, so `supabase link` refuses before the network would.

**Migration 0011 has not been applied to the project.** Everything else in this change is committed and pushed.

## Apply migration 0011 before the deploy matters

Vercel auto deploys from `main`, so the new code is live the moment the push lands, but `profiles.spoiler_shield` does not exist yet. Until you run this, `getViewer` selects a missing column and every signed in read fails. Logged out readers are unaffected, since their shield is in cookies.

```bash
git pull
export SUPABASE_ACCESS_TOKEN=<Supabase, Account, Access Tokens>
pnpm exec supabase link --project-ref hxljpyqwhdhxkcasmgut
pnpm supabase:push
```

Or without a token:

```bash
pnpm exec supabase db push \
  --db-url "postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.hxljpyqwhdhxkcasmgut.supabase.co:5432/postgres"
```

The migration is one statement, additive, and safe to run against the seeded project:

```sql
alter table public.profiles
  add column if not exists spoiler_shield boolean not null default false;
```

Every existing row keeps its `progress` and gets the shield off, which is the new default.

## Verified in this container

**Unit and component suite, 316 tests, `pnpm test`**

- `SPOILER_SHIELD_DEFAULT` is `false`.
- With `NO_GATING`, every level 0 through 7 comes back in full, body included, one item and in a list.
- With the shield on, gating is exactly what it was: body removed at any depth, title and topic and kind and author and counts and timestamp kept, and a one character body and a nine thousand character body serialize identically.
- `getViewerProgress` returns `NO_GATING` for a guest with no cookies, for a guest who switched the shield off, and for a signed in reader whose column says off. It returns the level once either says on.
- A signed in reader's columns win outright: guest cookies saying on and level 7 are ignored when the profile says off.
- Cookie parsing: levels, clamping past 7, and null for absent, empty, `three`, `-1`, `2.5`, `<script>`. The shield cookie reads only `on` and `off`, and null for `true`, `1`, `ON`, `yes`.
- Both cookies are written with `path=/`, `SameSite=Lax`, and a one year `maxAge`.
- `setSpoilerShield` writes cookies for a guest and never touches the database; for a signed in reader it writes `{progress, spoiler_shield}` in one update. It rejects a level outside the list either way, and reports a failed write.
- Switching the shield off keeps the level, so turning it back on lands where you were.
- `adoptAnonymousShield` carries an on shield with its level, carries a level chosen while the shield was off, does nothing for a guest who never touched the control, and leaves the cookies alone when the update fails.
- `ShieldControls`: no chapter list while off, every chapter with the current one marked while on, toggling on keeps the level, picking a chapter refreshes so the feed re-gates without a reload, a failed save shows and does not refresh.
- `ShieldPill`: reads "off" or the chapter, opens and closes, closes on Escape, closes once a save lands, and its accessible name spells out the state because the visible label is abbreviated on small screens.
- The spoiler level badge is still on a card the shield is not holding back.
- Onboarding saves the username only and no longer sends a progress level.

**Database suite, 41 tests, `pnpm test:db`**

Runs against Postgres in WebAssembly through pglite, applying the Supabase shim then every migration in order, **including 0011**. So the migration is proved to apply cleanly on top of 0001 to 0010. That is a real check of the SQL; it is not a check that it has been applied to your project.

New there: a fresh profile ships with `spoiler_shield` false and `progress` 0, and a reader can turn the shield on for their own row while row level security gives them zero rows on anyone else's.

**Playwright, 34 tests across desktop and mobile, `pnpm test:e2e`**

Against a production build with the project unreachable, so these cover the chrome and the cookie path rather than content:

- No dialog on a first visit. The sheet is gone.
- The pill reads "off", opens a popover with the toggle, and shows no chapter list while off.
- Turning it on writes `askgta6_shield=on` and `askgta6_progress=0` with `SameSite=Lax` and an expiry over 360 days out, read back from the real browser jar, and renames the pill.
- Picking Chapter 5 persists to the cookie, renames the pill, and survives a reload.
- Switching back off keeps chapter 6 in the cookie.
- The pill is present at 390px with no floating trigger left over.
- The landing demo still shows bodies sealing and opening, independent of the reader's own shield.

**Coverage:** 92.4% lines, 86.9% branches. Threshold 80, enforced.

## Indexing and metadata: deliberately unchanged

`lib/indexing.ts`, `app/robots.ts`, `app/sitemap.ts` and their 61 tests have a zero line diff this turn. Page metadata and the Open Graph route still read at a fixed level 0 rather than the reader's shield, so a crawler sees exactly what it saw before. `NEXT_PUBLIC_INDEXING` is still `off` in production, so `robots.txt` disallows everything regardless.

## Not verified

Nothing here is known broken. It is untested against the live project.

| Area | Why it matters |
| --- | --- |
| Migration 0011 applied | Until it is, signed in reads fail on a missing column. Logged out readers are fine. |
| The shield for a signed in reader | Every assertion about `profiles.spoiler_shield` ran against pglite or a fake client, never against real PostgREST. |
| Cookie adoption on signup | Unit tested against a fake client. The real path also depends on the profile row existing when it runs. |
| Auth round trip | Sign up, confirmation, magic link, and the callback code exchange have never run against real GoTrue. |
| Storage, feed with real content, Vercel Analytics | Same as before: never exercised against a reachable backend. |

## Local files

- `.env.local` holds the real project URL, anon key, and service role key, with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and `NEXT_PUBLIC_INDEXING=off`. Mode 600, gitignored.
- `supabase/.temp/` is gitignored and was not committed.
