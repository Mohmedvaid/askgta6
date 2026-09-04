# Testing

Three layers, each proving something the others cannot.

## Run them

| Command | What runs | Needs |
| --- | --- | --- |
| `pnpm test` | Unit and component tests, with coverage | Nothing |
| `pnpm test:db` | Migrations, triggers, and row level security | Nothing, not even Docker |
| `pnpm test:e2e` | Playwright against a production build | A Chromium |
| `pnpm check` | Typecheck, lint, unit, database | Nothing |

`pnpm check` is the gate. Run it before pushing. It does not include the end to end suite, because that needs a build first.

## Unit and component

`tests/unit/`, jsdom, Vitest.

Covers the pure helpers (`applySpoilerGate`, cookie parsing, cursor encoding, markdown, relative time, slug and username rules), every zod schema valid and invalid, every component's rendering states, every server action's returned result, and the auth error mapping.

Two rules hold throughout:

- **Assert on outcomes, never that a mock was called.** `tests/unit/fake-supabase.ts` stands in for the PostgREST query builder: it records the chain and resolves to a result the test supplies, and the test asserts on what the function returned.
- **The gate gets exercised exhaustively.** All 64 combinations of reader level and item level, plus the shield being off, plus a check that a one character body and a nine thousand character body serialize identically so no length leaks.

## Database

`tests/db/`, Vitest, no Docker.

This is the layer that proves the product works. It boots Postgres in WebAssembly through `@electric-sql/pglite`, applies `tests/db/supabase-shim.sql`, then applies **every migration in `supabase/migrations/` in filename order**.

The shim creates the small part of a Supabase project the migrations depend on and nothing more: an `auth` schema, a minimal `auth.users` table, `auth.uid()` reading `request.jwt.claims`, and the `anon`, `authenticated`, and `service_role` roles. Grants are written out explicitly in migration `0006` so the harness gets the same permissions a real project does, rather than inheriting a superuser's.

`asUser(db, userId, fn)` and `asAnon(db, fn)` set the role and the JWT claims for the duration of a callback, so row level security is exercised exactly the way Supabase exercises it.

Because a new migration has to apply cleanly on top of all the others for this suite to pass, **a broken migration fails here before it reaches the project.** What this suite does not prove is that a migration has been applied to production; that is a separate step in the [runbook](../system/runbook.md).

`tests/db/admin.test.ts` is the file that matters most now: it proves a banned
account is refused by Postgres on posts, replies, votes, groups, reports, and edits,
that nobody can grant themselves `is_admin` or lift their own ban, and that the
audit table takes no client writes. Those are the guarantees the admin dashboard
depends on, and none of them is testable from the UI.

It also holds the username cooldown, the bio length constraint, the spam list
policies, and `link_privilege_stats`, all for the same reason: a trigger and a
constraint are reachable by anything holding a session, not only by the action that
normally writes them.

What it asserts, among other things: private group posts are invisible to non members through select, through ranked search, and through counts; clients cannot write `vote_count`, `reply_count`, `is_hidden`, or `accepted_reply_id`; report auto hide fires at exactly five distinct reporters and not at four; the rate limits hold; a reader can turn their own spoiler shield on and gets zero rows touching anyone else's.

## End to end

`tests/e2e/`, Playwright, desktop and mobile projects, run against `pnpm build && pnpm start`.

It runs against a build whose Supabase project may be unreachable, so it covers the shell, the cookie paths, and client side behaviour rather than content. That is a deliberate limit, not an accident: the content flows are proved at the SQL and action layers instead.

Covered: the landing hero and the client side gate demo; the spoiler shield pill reading off, opening its popover, writing both cookies with the right `SameSite` and expiry read back from the real browser jar, renaming itself, persisting across a reload, and keeping the chapter when switched off; the pill on mobile with no leftover floating trigger; the feed shell and its empty state; sign out not being offered to a signed out reader; redirects for signed out visitors; the 404; the rail becoming a bottom bar; and no horizontal overflow at 1440, 1024, 768, or 390.

If the sandbox ships a Chromium that does not match the bundled revision, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path. On a normal machine run `pnpm exec playwright install chromium` and ignore that.

## Coverage

Enforced in `vitest.config.mts` at **80 percent lines and branches**. `pnpm test` fails below it. Coverage spans `lib/`, `actions/`, and `components/`. Excluded: `lib/theme/fonts.ts`, which is one `next/font` call, and `lib/supabase/**`, which is client construction exercised by everything else.

The suite currently sits above 90 percent lines. Treat the threshold as a floor, not a target.
