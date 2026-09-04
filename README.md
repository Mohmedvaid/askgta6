# AskGTA6

A spoiler safe community for Grand Theft Auto VI. People ask questions, post tips, vote, and mark accepted answers. Every post and reply carries the chapter it belongs to, and the server never sends you anything past where you have played.

Fan made and unofficial. Not affiliated with Rockstar Games or Take-Two Interactive.

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase keys, see docs/system/runbook.md
pnpm supabase:push           # applies supabase/migrations to your project
pnpm seed                    # about 180 posts, 450 replies, 4 accounts, 3 groups
pnpm dev
```

Full setup, the Supabase Auth settings you have to flip, and every operating procedure: **[the handbook in docs/](docs/README.md)**.

The migrations are already applied to the shared project, so `supabase:push` and `seed` are only needed for a fresh project.

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

The shield is opt in. `SPOILER_SHIELD_DEFAULT` is `false`, so a reader who has not turned it on gets `NO_GATING` and every post and reply comes back in full.

With the shield on, an item at or below the reader's chapter comes back whole. Anything above it comes back with `body` deleted and `hidden: true` set. Everything else survives: title, topic, kind, author, counts, timestamp. Titles are visible at every level so a reader can tell what a thread is about before deciding to open it, which puts the burden on authors to keep spoilers out of titles. The composer says so, and `spoiler_in_title` is a report reason. The spoiler level badge is on every card and post whatever the shield is doing.

There is no blanked body and no body length, because either one leaks. Redaction runs at any depth, so an embedded row cannot smuggle prose through.

Every read of a post or a reply goes through `lib/queries/`, which calls the gate, so no page can reach the database without it. Reveals go through `revealContent`, return once, are held in component state, and never change the reader's progress.

The shield has one reader, `getViewerProgress`. A signed in person's state comes from `profiles.spoiler_shield` and `profiles.progress`, a logged out one's from the `askgta6_shield` and `askgta6_progress` cookies (one year, SameSite=Lax). Both default to off.

The only control is the pill in the header: "Spoiler shield: off", or the chapter it is holding you at. Clicking it opens a popover with a toggle and the chapter list. Every change saves on the spot and refreshes, so the feed re-gates without a page load. The settings page carries the same control, and the two cannot disagree because they are the same component. Signing up copies the guest cookies onto the new profile and drops them.

## Layout

```
app/
  (marketing)/     landing page, logged out
  (app)/           everything behind the shell: feed, post, compose, groups, profile, settings, admin
  auth/            sign in, sign up, OAuth, callback, sign out
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

The live theme is Vice: a neutral near black base, one hot rose accent, and a warm bone treatment for a sealed body. `docs/design/README.md` has the alternatives that were considered and the contrast table any replacement has to hold.

Everything visual lives in one place each:

- Colors, radii, shadows, spacing: `lib/theme/tokens.css`. No hex, rgb, hsl, or oklch literal may appear anywhere else, and `pnpm lint` fails if one does. `pnpm test` checks every pair against WCAG AA in both themes, parsing that file rather than a copy.
- Fonts: `lib/theme/fonts.ts`. Archivo Black, Inter, IBM Plex Mono.
- Logo: `components/brand/Wordmark.tsx` and `components/brand/Mark.tsx`, which read their colors from tokens, plus `app/icon.svg` for the favicon and `lib/theme/og.ts` for link previews, which both need their colors written out and are checked against the tokens by the suite.
- Spoiler level labels: `SPOILER_LEVELS` in `lib/spoilers.ts`. Rename them when the real story structure is public. The count stays at eight.

## Indexing

`NEXT_PUBLIC_INDEXING` is `off` everywhere by default. While it is off, `robots.txt` disallows everything, the sitemap is empty, every page emits `noindex, nofollow`, and `next.config.ts` adds an `X-Robots-Tag` header on every response. Setting it to `on` opens up the landing page, the feed, public groups, public profiles, and every public post whatever its level, since every post has a readable title.

These stay noindex whatever the flag says: `/auth/*`, `/settings`, `/admin/*`, `/new`, `/g/*/new`, `/g/join/*`, `/onboarding`, private group pages and the posts inside them, moderation hidden posts, and the 404 and error pages.

The value is inlined at build time, so changing it needs a rebuild.

## Feeds and structured data

`/feed.xml` carries the latest fifty level 0 posts, `/g/<slug>/feed.xml` the same for one public group. Titles, links, authors, dates. No item has a description and the query never selects a body, because a feed reader has no shield. Both are empty while indexing is off, as the sitemap is.

Post pages emit JSON-LD: a `QAPage` for a question with a readable accepted answer, a `DiscussionForumPosting` otherwise, and a `CollectionPage` for a public group. Nothing is emitted for a page that is not indexable, and no branch can carry a gated body.

## Analytics

Vercel Analytics, mounted in the root layout. `lib/analytics.ts` declares exactly four events with typed properties: `signup_completed`, `progress_set`, `post_created`, `reveal_clicked`. No payload carries a user id, a title, or a body.

## Auth

Email and password, plus Discord and Google behind their flags.

Password reset is at `/auth/forgot`, linked from the sign in page. It answers identically for an address with an account and one without, so it cannot be used to enumerate members. The reset link lands on `/auth/callback?next=/auth/reset`, and that page needs both a session and a short lived recovery marker cookie that only the callback sets, so it is not a change password form for whoever happens to be signed in. `PASSWORD_RESET_ENABLED` in `lib/auth-features.ts` switches the send off if the sender misbehaves.

Magic link sign in is **disabled** as of September 2026, pending confidence in the new SMTP sender. Nothing was deleted: the action is still there and still tested, the form is gone from the sign in page, and `MAGIC_LINK_ENABLED` in `lib/auth-features.ts` is false so a stray post does nothing. Turning it back on means flipping that flag and restoring the form.

Every auth redirect is built by `authCallbackUrl()` in `lib/auth-callback.ts` and nothing else, which a source scanning test enforces. It prefers the origin the request arrived on, from `x-forwarded-host` and `x-forwarded-proto`, over `NEXT_PUBLIC_SITE_URL`, because that variable is baked in at build time and can be stale. It always appends `/auth/callback` and throws in production rather than falling back to localhost.

That origin still has to be in the Supabase project's redirect allow list. When it is not, Supabase discards it and substitutes its own Site URL, which is a bare origin with no path.

Every auth action logs the Supabase code, status, and message with `console.error` so Vercel runtime logs show what actually failed, and never logs an email, token, or password. Known codes map to copy that says what to do next (rate limited, redirect not allowed, invalid credentials, email already registered); anything unmapped keeps a generic message rather than leaking internals. The mapping is `lib/auth-errors.ts`.

Signing out is one server action, reachable from the account menu in the header and from the bottom of settings. It clears the session and returns to the landing page.

## Moderation

Five distinct reporters hide a post or a reply automatically. Users listed in `ADMIN_USER_IDS` can open `/admin/reports` to hide, unhide, or delete. That is the whole system. There is no roles table.
