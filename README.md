# AskGTA6

A spoiler safe community for Grand Theft Auto VI. People ask questions, post tips, vote, and mark accepted answers. Every post and reply carries the chapter it belongs to, and the server never sends you anything past where you have played.

Fan made and unofficial. Not affiliated with Rockstar Games or Take-Two Interactive.

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase keys, see docs/DEPLOY.md
pnpm supabase:push           # applies supabase/migrations to your project
pnpm seed                    # about 180 posts, 450 replies, 4 accounts, 3 groups
pnpm dev
```

Full setup, including the Supabase Auth settings you have to flip: [docs/DEPLOY.md](docs/DEPLOY.md).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server on port 3000 |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm check` | Typecheck, lint, unit tests with coverage, database tests. Run this before pushing. |
| `pnpm test` | Unit and component tests, fails under 80 percent lines and branches |
| `pnpm test:db` | pglite backed migration, trigger, and row level security tests |
| `pnpm test:e2e` | Playwright smoke suite against `pnpm build && pnpm start` |
| `pnpm seed` | Idempotent seed against `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Writes fresh account passwords to the gitignored `seed-credentials.local.json`. |
| `pnpm supabase:push` | `supabase db push` |

The database tests need no Docker. They boot Postgres in WebAssembly through pglite, apply a small Supabase shim, then apply every migration, so row level security is exercised the way Supabase exercises it.

## How the spoiler gate works

`lib/spoilers.ts` exports eight levels, 0 (`Haven't played`) through 7 (`Finished`), and one pure function:

```ts
applySpoilerGate(item, viewerProgress)
```

An item at or below the viewer's progress comes back whole. Anything above it comes back with `title` and `body` deleted and `hidden: true` set, keeping only what a placeholder card needs: id, topic, kind, level, counts, timestamp, author. There is no blanked field and no length, because either one leaks.

Every read of a post or a reply goes through `lib/queries/`, which calls the gate, so no page can reach the database without it. Reveals go through `revealContent`, return once, are held in component state, and never change the viewer's progress.

## Layout

```
app/
  (marketing)/     landing page, logged out
  (app)/           everything behind the shell: feed, post, compose, groups, profile, settings, admin
  auth/            sign in, sign up, magic link, OAuth, callback, sign out
components/        one component per file, grouped by concern
lib/
  spoilers.ts      levels and the gate
  queries/         the only place posts and replies are read
  validation.ts    zod schema per mutation
  theme/           tokens.css, fonts.ts, the whole palette
  supabase/        server, browser, admin, and middleware clients
actions/           server actions, one file per domain
supabase/
  migrations/      numbered SQL, runs on a fresh project and inside pglite
  seed/            pnpm seed
tests/
  unit/            pure helpers, schemas, component states, action outcomes
  db/              pglite harness and the RLS suite
  e2e/             Playwright
```

## Swapping the brand

Everything visual lives in one place each:

- Colors, radii, shadows, spacing: `lib/theme/tokens.css`. No hex, rgb, hsl, or oklch literal may appear anywhere else, and `pnpm lint` fails if one does.
- Fonts: `lib/theme/fonts.ts`.
- Logo: `components/brand/Wordmark.tsx` and `components/brand/Mark.tsx`, plus `app/icon.svg` for the favicon.
- Spoiler level labels: `SPOILER_LEVELS` in `lib/spoilers.ts`. Rename them when the real story structure is public. The count stays at eight.

## Indexing

`NEXT_PUBLIC_INDEXING` is `off` everywhere by default. While it is off, `robots.txt` disallows everything, the sitemap is empty, every page emits `noindex, nofollow`, and `next.config.ts` adds an `X-Robots-Tag` header on every response. Setting it to `on` opens up exactly four things: the landing page, the feed, public groups, and level 0 posts and the profiles that have them.

These stay noindex whatever the flag says: `/auth/*`, `/settings`, `/admin/*`, `/new`, `/g/*/new`, `/g/join/*`, `/onboarding`, private group pages, the 404 and error pages, and any post or profile whose content is gated above level 0 for a logged out reader.

The value is inlined at build time, so changing it needs a rebuild.

## Moderation

Five distinct reporters hide a post or a reply automatically. Users listed in `ADMIN_USER_IDS` can open `/admin/reports` to hide, unhide, or delete. That is the whole system. There is no roles table.
