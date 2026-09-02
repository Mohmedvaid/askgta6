# AskGTA6 MVP: full build prompt

## 0. How to operate this session

You are building a complete, working MVP from an empty repo in one unattended session. Nobody is watching. Read this entire document before writing a line of code, then execute end to end.

Rules of the session:

- Do not stop to ask questions. Every open decision in this document is yours. Pick the option that is simplest, ships, and is easy to change later. Record every non-obvious decision in `docs/DECISIONS.md` with one line each: what you chose, what you rejected, why.
- Logo, final fonts, and final colors will be chosen later by a human. Ship your best placeholder versions and make each one swappable from exactly one file. Do not let their absence block anything.
- If a tool, package, or service is unavailable in this environment, work around it and note the workaround in `docs/DECISIONS.md`. Never leave a feature half-wired because an external dependency was missing. Stub it behind a clear interface and note what a human has to paste in.
- Commit early and often with clear messages. Push to the remote if a remote is configured. Do not squash.
- Do not open PRs. Work directly on `main`.
- Hard writing rule for all copy, comments, docs, commit messages, and seed content: never use em dashes. Use commas, periods, colons, or parentheses.
- Finish with the final report described in section 17, written to `docs/BUILD_REPORT.md`.

If you find yourself about to ask "should I do X or Y", the answer is: the one that gets a working product with less code.

## 1. What this is

AskGTA6 is a spoiler-safe community for Grand Theft Auto VI (releases November 19, 2026, PS5 and Xbox Series X|S, single-player only at launch). It is a forum, not a chat app. People ask questions, post tips and discussion, vote, mark accepted answers, and optionally join groups.

The one feature that makes it different from Reddit: every post carries a spoiler level (how far into the story it spoils), every user sets their own progress, and anything ahead of the user is hidden by default, server-side, with an explicit reveal. That rule is the product. Everything else is a normal forum.

Positioning line for the footer and meta description: "A spoiler-safe place for GTA VI questions, tips, and talk. Set your progress once. Never get spoiled again." Include on every page: "Unofficial fan site. Not affiliated with Rockstar Games or Take-Two Interactive."

Do not use any Rockstar or Take-Two logos, trailer frames, screenshots, or official art anywhere. All graphics are original placeholders you create.

## 2. Stack

- Next.js (latest stable, App Router, TypeScript strict), React Server Components by default, client components only where interaction requires it.
- Tailwind CSS v4 with the theme defined entirely through CSS custom properties (section 4).
- Supabase: Auth, Postgres, Row Level Security, Storage (avatars only).
- `@supabase/ssr` for server and browser clients. Server Actions for all mutations. No separate API layer, no custom Express, no tRPC.
- Vitest for unit and integration tests. Playwright for a small end-to-end smoke suite.
- `@electric-sql/pglite` for database tests when Docker is not available (section 13).
- Vercel for hosting (config only, no deploy from this session).
- pnpm.

No state management library. No ORM. No component library beyond headless primitives if you truly need them (Radix or Base UI are acceptable for menus, dialogs, and tooltips; nothing that ships its own visual style). No CSS-in-JS. No form library unless a form has more than four fields (none do).

## 3. Repo layout

```
/
  app/
    (marketing)/            landing page for logged-out visitors
    (app)/                  everything behind the shell
      feed/
      p/[postId]/
      new/
      g/                    groups index
      g/[slug]/
      g/new/
      u/[username]/
      settings/
    auth/                   sign in, sign up, callback, sign out
    layout.tsx
    globals.css
  components/               shared UI, one component per file
  lib/
    supabase/               server.ts, client.ts, middleware.ts
    spoilers.ts             spoiler levels config and gating helpers (pure)
    theme/                  tokens.css and fonts.ts (section 4)
    validation.ts           zod schemas for every mutation input
  actions/                  server actions, one file per domain (posts, replies, votes, groups, reports, profile)
  supabase/
    migrations/             numbered SQL migrations
    seed/                   seed.ts and seed data files
  tests/
    unit/
    db/                     pglite-backed migration, trigger, and RLS tests
    e2e/                    playwright
  docs/
    DECISIONS.md
    BUILD_REPORT.md
    DEPLOY.md
  .env.example
```

Do not create `utils.ts`, `helpers.ts`, `types/index.ts` barrels, or a `constants.ts` dumping ground. Name the actual concern.

## 4. Theme system: zero hardcoded visual values

This is a hard requirement and will be checked.

- `lib/theme/tokens.css` is the single source of truth for every color, radius, spacing scale, shadow, and font family. Define them as CSS custom properties on `:root` with a `[data-theme="dark"]` override block. Tailwind v4 consumes them through `@theme` so utilities like `bg-surface-1` and `text-accent` resolve to the variables.
- No hex, rgb, hsl, or oklch literal may appear anywhere outside `tokens.css`. No inline `style` colors. No Tailwind default color utilities (`bg-zinc-900`, `text-gray-500`, etc.). Add an ESLint rule or a simple test that greps `app/`, `components/`, and `actions/` for color literals and default palette class names and fails if any are found.
- `lib/theme/fonts.ts` loads fonts through `next/font` and exports the CSS variable names. Swapping a font means editing this one file.
- Token naming, at minimum: `--surface-0` (page), `--surface-1` (card), `--surface-2` (raised), `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--border-strong`, `--accent`, `--accent-text`, `--accent-bg`, `--danger`, `--warning`, `--success`, `--spoiler` (the hidden-content treatment), `--radius-sm`, `--radius-md`, `--radius-lg`, `--font-display`, `--font-body`, `--font-mono`.
- Dark is the default theme. Light must work and be switchable from settings. Persist the choice in a cookie and apply it on the `<html>` element before paint (no flash).
- Logo: create `components/brand/Wordmark.tsx` rendering an original SVG wordmark for "AskGTA6" built from type and simple geometry. Also a square mark for favicon and avatar fallback. Both read colors from tokens. These are placeholders; make them decent, then move on.

## 5. Design direction

Desktop first. Players are on PC when they are looking things up, and console players will hit it from a phone. Both must work well, desktop is the primary canvas.

Aesthetic brief:

- Read your frontend-design skill if one is available in this environment before designing anything. Apply it.
- Not a Discord clone, not a Reddit clone, not a generic SaaS dashboard. Editorial and confident. Think of a well-designed games magazine spread more than an app.
- Loosely packed. Generous whitespace, wide gutters, large type at the top of the hierarchy, dense only where the content is dense (reply threads).
- One accent color, used sparingly for actions and the spoiler mechanic. Do not build a neon Vice City sunset gradient site. If you want a nod to the setting, do it with a single warm accent and restraint, not with palm trees and pink-to-blue gradients.
- Distinctive type pairing: a display face with real character for headlines and the wordmark, a highly readable body face. Never Inter for both. Choose from Google Fonts so it works without licensing.
- Motion: minimal, purposeful. The spoiler reveal should have a short, satisfying transition. Nothing else needs animation.
- The hidden-post treatment must look intentional and premium, not like a broken card. Hidden posts show the topic, the spoiler level badge, and a reveal button, with the title and body replaced by a structured placeholder. No blur of real text (that leaks length and shape; the server never sends the text anyway).
- Layout: on desktop, a three-region shell: a slim left navigation rail (feed, groups, new post, your groups), a wide center content column with a comfortable max width, and a right column for context (progress control, topic filters, group info). On tablet the right column collapses under the content. On mobile the left rail becomes a bottom bar with four items and the right column content moves into a sheet.
- Empty states are invitations with a single verb button, never apologies.
- All interactive elements keyboard accessible with visible focus states. Color contrast AA in both themes.

## 6. Data model and migrations

Write numbered SQL migrations in `supabase/migrations/`. They must run on a fresh Supabase project with `supabase db push` and also inside pglite with the test shim (section 13). Use `public` schema for everything you create. Reference `auth.users(id)` for user identity.

Tables:

`profiles`
- `id uuid primary key references auth.users(id) on delete cascade`
- `username text unique not null` (3 to 20 chars, lowercase letters, digits, underscore; enforce with a check constraint)
- `display_name text`
- `avatar_path text`
- `progress smallint not null default 0` (see spoiler levels)
- `theme text not null default 'dark'`
- `created_at timestamptz default now()`
- Trigger: on `auth.users` insert, create a profile row with a generated placeholder username (`player_` plus 6 random chars) so signup never fails on a missing profile. User picks a real username in onboarding.

`groups`
- `id uuid pk default gen_random_uuid()`
- `slug text unique not null` (from name, lowercase, hyphens)
- `name text not null`
- `description text`
- `visibility text not null check (visibility in ('public','private'))`
- `owner_id uuid not null references profiles(id)`
- `member_count int not null default 0` (trigger-maintained)
- `created_at`

`group_members`
- `group_id uuid references groups(id) on delete cascade`
- `user_id uuid references profiles(id) on delete cascade`
- `role text not null default 'member' check (role in ('owner','member'))`
- `created_at`
- primary key `(group_id, user_id)`

`group_invites`
- `id uuid pk`
- `group_id uuid references groups(id) on delete cascade`
- `code text unique not null` (short random)
- `created_by uuid references profiles(id)`
- `expires_at timestamptz`
- `created_at`

`posts`
- `id uuid pk`
- `author_id uuid not null references profiles(id)`
- `group_id uuid null references groups(id) on delete cascade`
- `topic text not null check (topic in ('story','vehicles','locations','map','characters','help','general'))`
- `kind text not null check (kind in ('question','discussion'))`
- `title text not null check (char_length(title) between 8 and 140)`
- `body text not null check (char_length(body) between 1 and 10000)`
- `spoiler_level smallint not null default 0`
- `vote_count int not null default 0` (trigger-maintained)
- `reply_count int not null default 0` (trigger-maintained)
- `accepted_reply_id uuid null` (FK added after replies table exists)
- `is_hidden boolean not null default false` (moderation)
- `search tsvector generated always as (to_tsvector('english', title || ' ' || body)) stored`, GIN index
- `created_at`, `updated_at`
- Indexes: `(created_at desc)`, `(vote_count desc, created_at desc)`, `(group_id, created_at desc)`, `(topic, created_at desc)`, `(author_id)`.

`replies`
- `id uuid pk`
- `post_id uuid not null references posts(id) on delete cascade`
- `author_id uuid not null references profiles(id)`
- `body text not null check (char_length(body) between 1 and 10000)`
- `spoiler_level smallint not null default 0`
- `vote_count int not null default 0`
- `is_hidden boolean not null default false`
- `created_at`, `updated_at`
- Index `(post_id, created_at)`.

`votes`
- `user_id uuid references profiles(id) on delete cascade`
- `target_type text not null check (target_type in ('post','reply'))`
- `target_id uuid not null`
- `value smallint not null check (value in (-1, 1))`
- `created_at`
- primary key `(user_id, target_type, target_id)`
- Trigger on insert, update, delete: recompute `vote_count` on the target row.

`reports`
- `id uuid pk`
- `reporter_id uuid references profiles(id)`
- `target_type text check in ('post','reply')`
- `target_id uuid not null`
- `reason text not null check (reason in ('spam','leak','harassment','wrong_spoiler_level','other'))`
- `note text`
- `created_at`
- unique `(reporter_id, target_type, target_id)`
- Trigger: after insert, if the target has 5 or more reports from distinct reporters, set `is_hidden = true` on the target. Hidden content is visible only to its author (RLS) and shows an "under review" state to them.

Functions (SQL, `security definer` only where RLS makes a plain query impossible, and then with `set search_path = public`):

- `set_progress(new_level smallint)`: updates the caller's profile, validates range.
- `accept_reply(p_post_id uuid, p_reply_id uuid)`: only the post author, reply must belong to the post, sets `accepted_reply_id`.
- `join_group_by_invite(p_code text)`: validates code and expiry, inserts membership, returns group slug.
- `cast_vote(p_target_type text, p_target_id uuid, p_value smallint)`: upsert or delete on value 0. Simpler than three separate mutations.

RLS (enable on every table, deny by default):

- `profiles`: everyone can select; only the owner can update; no direct insert or delete from clients.
- `groups`: public groups visible to all; private groups visible to members; insert by any authenticated user (owner set to `auth.uid()`); update and delete by owner.
- `group_members`: members of a group can see its member list; insert allowed for public groups by the user themselves, for private groups only through the invite function; delete own membership; owner can delete any member.
- `posts`: visible when `is_hidden = false` and (`group_id is null` or the group is public or the caller is a member); authors always see their own; insert by authenticated where `author_id = auth.uid()` and, if `group_id` is set, the caller is a member; update and delete by author only, and `vote_count`, `reply_count`, `is_hidden`, `accepted_reply_id` cannot be changed by the client (use a trigger that rejects changes to those columns from non-definer contexts, or separate the mutable columns behind the functions).
- `replies`: same visibility as their post; insert by authenticated where `author_id = auth.uid()` and the post is visible to them; update and delete by author.
- `votes`: select own; all writes through `cast_vote`.
- `reports`: insert own; no select for regular users.

Write the RLS so that a private group's posts are truly invisible to non-members, including in search and in counts. Test that in section 13.

## 7. Spoiler levels and gating

`lib/spoilers.ts` exports the level list and pure helpers. Levels are a hardcoded array of objects with `level`, `label`, `description`. Ship these:

0. "Haven't played" (pre-launch, trailers only, safe for everyone)
1. "Chapter 1"
2. "Chapter 2"
3. "Chapter 3"
4. "Chapter 4"
5. "Chapter 5"
6. "Chapter 6"
7. "Finished" (endings, post-credits, everything)

Labels will be renamed after launch when the real story structure is public; the number of levels stays at 8.

Gating rule, enforced server-side in the read path:

- A post or reply is fully visible to a viewer when `spoiler_level <= viewer.progress`.
- Otherwise the server returns a redacted shape: id, topic, kind, spoiler_level, vote_count, reply_count, created_at, author username, and `hidden: true`. No title, no body, not even a length. The client renders the placeholder with a reveal button.
- Reveal: the client calls a server action `revealPost(postId)` that returns the full content once. Reveals are session-only, not persisted, and never change the user's progress. Do not store reveals.
- Logged-out visitors have progress 0. They see level 0 content and placeholders for everything else, which is the correct behavior before launch and a decent teaser after.
- Replies are gated individually by their own `spoiler_level`, so a level 0 question can have a level 3 reply that stays hidden from a level 0 reader.
- Compose defaults `spoiler_level` to the author's current progress and shows a clear control to raise it. Authors cannot set a level below 0 or above 7. Encourage tagging up with helper copy: "Not sure? Tag it higher. Hiding a safe post is harmless. Spoiling someone is not."

Put the gating logic in one pure function `applySpoilerGate(item, viewerProgress)` and use it everywhere posts or replies are read. Unit test it exhaustively.

## 8. Screens and behavior

Landing (logged out, `/`): wordmark, one sentence value prop, the progress slider as a live demo (moving it hides and reveals three sample cards client-side, no data needed), sign in and sign up buttons, a preview of the latest level 0 posts, footer with disclaimer. Fast, mostly static.

Feed (`/feed`): default landing for logged-in users. Tabs: Latest, Top (last 7 days by vote_count), Unanswered (kind = question and accepted_reply_id is null). Topic filter chips. Each card: topic badge, spoiler level badge, title, first 160 chars of body, author, relative time, vote and reply counts. Hidden cards use the placeholder treatment. Paginate with a cursor on `(created_at, id)`, 20 per page, "Load more" button. No infinite scroll.

Post (`/p/[postId]`): full post, vote control, accepted answer pinned at top of replies when present, replies sorted by accepted first, then vote_count desc, then created_at asc. Reply composer at the bottom with its own spoiler level control. Author sees edit and delete. Post author sees "Mark as answer" on each reply. Report button on post and replies (dialog with reason select and optional note). Meta tags: title, description, and Open Graph with an original generated OG image using `next/og` that shows the wordmark, topic, and title (only for level 0 posts; higher levels get a generic OG image so link previews never spoil).

New post (`/new` and `/g/[slug]/new`): title, body (plain textarea with basic markdown support for bold, italic, links, code, lists; render with a safe markdown library and sanitize), kind toggle (question or discussion), topic select, spoiler level control. Validate with zod on the server. Redirect to the new post.

Groups (`/g`): two sections, "Your groups" and "Discover" (public groups by member_count desc). Create group button.

Group (`/g/[slug]`): header with name, description, visibility badge, member count, join or leave button (public), invite link generator (owner, private groups; shows a copyable URL like `/g/join/CODE`). Below: the same feed component filtered to the group. Non-members of a private group get a clean "This group is private" page with a place to paste an invite code.

Join by invite (`/g/join/[code]`): validates and joins, redirects to the group.

Profile (`/u/[username]`): avatar, display name, username, member since, progress badge, tabs for their posts and replies (respecting the viewer's gate, obviously).

Settings (`/settings`): username (unique check on submit with a clear inline error), display name, avatar upload to Supabase Storage bucket `avatars` (public read, owner write, 2 MB limit, image types only), progress slider with level descriptions, theme toggle. Progress change takes effect immediately across the app.

Auth (`/auth/*`): email and password sign up and sign in, plus magic link. Wire Discord and Google OAuth buttons behind `NEXT_PUBLIC_AUTH_DISCORD_ENABLED` and `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` flags so they render only when enabled; the human will add provider credentials in Supabase later. After first sign in, if the username still starts with `player_`, route to a one-screen onboarding: pick username, pick progress, done.

Search (`/feed?q=`): Postgres full-text on the `search` column, ranked by `ts_rank`, gated the same way. A search box in the shell header.

Global: a 404 page and an error boundary in the app shell, both on-brand.

## 9. Moderation

Reports table and the auto-hide trigger from section 6. Additionally: an `ADMIN_USER_IDS` env var (comma-separated uuids). Users in that list see a `/admin/reports` page listing reported content with counts and reasons, and can hide, unhide, or delete. This is the entire moderation system for v1. No roles table.

## 10. Seed content

Create `supabase/seed/seed.ts` runnable with `pnpm seed` against whatever `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. It must be idempotent (skips if seed users already exist).

Seed:
- 4 seed accounts with distinct usernames and avatars (generated SVG avatars, no external images).
- 2 public groups ("Vice City locals", "First-timers") and 1 private group ("Night shift") with an invite code printed to the console.
- 150 to 200 posts across all topics, mostly level 0, written as believable fan content about what is publicly known from the official trailers (Trailer 1, December 2023; Trailer 2, May 2025): Leonida, Vice City, Jason and Lucia, the setting, vehicles seen, social media parody features, questions about the map, wishlists, comparisons to GTA V, pre-order and edition questions ($79.99 Standard, $99.99 Ultimate, pre-orders open June 25, 2026, digital pre-load November 12, launch November 19, 2026, PS5 and Xbox Series X|S only, no PC and no online mode at launch). Mix of questions and discussions. Vary length and voice. Do not fabricate story details or claim leaks. Where uncertain, write it as speculation or a question. Do not describe content from any leak.
- About 20 posts tagged level 1 to 3 as placeholders so the gate is visibly working (titles like "Chapter 2 heist approach question", bodies that are clearly seed placeholders).
- 300 to 500 replies spread across posts, some accepted, plausible votes so the Top tab is not flat.

All seed text follows the no em dash rule.

## 11. Validation, errors, security

- Every server action validates its input with a zod schema from `lib/validation.ts` and returns a typed result (`{ ok: true, data } | { ok: false, error }`). Never throw to the client.
- Rate limit post and reply creation per user to a sane number per minute using a small Postgres-backed check (a count over the last 60 seconds in the insert path). No Redis.
- Sanitize rendered markdown. No raw HTML from users.
- Never expose the service role key to the client. Server actions use the user's session; only the seed script and admin operations use the service role, and admin operations must re-check `ADMIN_USER_IDS` server-side.
- Security headers via `next.config`: sensible CSP for self plus Supabase URL, `X-Content-Type-Options`, `Referrer-Policy`, frame denial.

## 12. Environment and deploy

`.env.example` with every variable and a one-line comment each:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=            (server only, seed and admin)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_DISCORD_ENABLED=false
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false
ADMIN_USER_IDS=
```

If `SUPABASE_ACCESS_TOKEN` and a project ref are present in the environment, link the project and push migrations. If not (expected), do not attempt it, and make sure `docs/DEPLOY.md` is a five-step checklist a human can finish in ten minutes: create Supabase project, paste keys into `.env.local` and Vercel, run `pnpm supabase:push` (a script wrapping `supabase db push`), run `pnpm seed`, deploy to Vercel. Include the Supabase Auth settings to flip (site URL, redirect URLs, email confirmation on or off) and the Storage bucket creation if the migration cannot create it.

The app must run locally with `pnpm dev` against a real Supabase project once keys are pasted, with zero further code changes.

## 13. Testing: 80 percent or better, and it must actually run here

Coverage target: 80 percent lines and branches across `lib/`, `actions/`, and `components/`, enforced in the Vitest config so `pnpm test` fails below it. Pages under `app/` are covered by the e2e smoke suite rather than the unit threshold.

Three layers:

Unit (Vitest, jsdom for components): every pure helper in `lib/` (spoiler gate, slug generation, username validation, cursor encoding, markdown sanitization, relative time), every zod schema (valid and invalid cases), and every component's rendering states (loading, empty, hidden post placeholder, revealed, error). Assert observable output, never that a mock was called.

Database (Vitest, pglite): this is the layer that proves the product works. Docker is probably not available in this environment, so do not depend on `supabase start`. Instead:
- Add `@electric-sql/pglite`.
- Write `tests/db/harness.ts` that boots a fresh pglite instance, applies `tests/db/supabase-shim.sql` (creates schema `auth`, a minimal `auth.users(id uuid primary key, email text)` table, roles `anon` and `authenticated`, and a function `auth.uid()` returning `nullif(current_setting('request.jwt.claims', true), '')::json->>'sub'` cast to uuid), then applies every file in `supabase/migrations/` in order.
- Provide helpers `asUser(client, userId)` and `asAnon(client)` that set the role and the `request.jwt.claims` setting for a transaction so RLS is exercised exactly as Supabase would exercise it.
- Test, at minimum: profile auto-creation trigger; username constraint; vote trigger keeps counts correct through insert, flip, and delete; reply_count trigger; accept_reply rejects non-authors and foreign replies; report auto-hide fires at exactly 5 distinct reporters and not at 4 or at 5 from the same reporter; private group posts are invisible to non-members via select, via search, and via counts; public group posts visible to all; members can post in a group, non-members cannot; users can only update their own posts; clients cannot modify `vote_count`, `is_hidden`, or `accepted_reply_id` directly; `join_group_by_invite` rejects expired and unknown codes.
- If Docker happens to be available, also make `pnpm test:db:supabase` run the same suite against `supabase start`. Do not require it.

E2E (Playwright): a smoke suite that runs against `pnpm build && pnpm start` with Supabase calls mocked at the network layer (route interception) or, if you can wire pglite behind the app for tests without contorting the codebase, real. Cover: landing renders and slider demo hides and reveals sample cards; feed renders with hidden and visible cards; reveal button shows content; compose validation errors show inline; mobile viewport shows the bottom bar and hides the rail. Keep it to under 10 tests. If mocking proves too brittle, keep the tests that pass and note the gap in the build report rather than burning hours.

Add `pnpm check` that runs typecheck, lint (including the no-color-literal rule), unit, and db tests. It must pass before you write the build report.

## 14. Anti-patterns you will be tempted by. Do not.

- A `utils.ts` or `helpers.ts` grab bag. Name the module by its concern.
- Barrel `index.ts` files re-exporting a directory.
- Wrapper functions that forward arguments unchanged to Supabase. Call the client.
- Interfaces or abstract "repositories" with one implementation. Server actions call Supabase directly.
- A generic `<Card>` with 14 props. Build the three cards the product needs.
- `try/catch` that logs and rethrows. Catch to handle or do not catch.
- Defensive checks for states the types make impossible.
- Comments that restate the line below. Comment only the why.
- Tests that assert a mock was called. Assert on outcomes.
- A theme provider in React that duplicates what the CSS variables already do. The cookie sets `data-theme` on `<html>`; that is the provider.
- Building realtime, notifications, DMs, image uploads in posts, an admin roles system, an AI assistant, or an SEO entity page system. None of these are in v1.
- Infinite scroll. Load more button.
- A giant `page.tsx` doing data fetching, gating, and rendering in one 400-line file. Fetch in the page, gate in `lib/spoilers.ts`, render in components.
- Skipping the README and deploy doc because "it's obvious." It is not obvious at 7 a.m. to someone who did not write it.

## 15. Copy and tone

Sentence case everywhere. Short, plain, confident. No exclamation marks in system copy. Errors say what happened and what to do next in one sentence. Empty states name the space and offer one verb. No "please", no "simply", no "just". No em dashes, ever.

## 16. Order of work

1. Bootstrap: create-next-app with TypeScript, App Router, Tailwind v4, ESLint, pnpm. Commit.
2. Theme tokens, fonts, wordmark, shell layout (rail, content, right column, responsive collapse). Commit.
3. Migrations, functions, RLS, triggers. Commit.
4. pglite harness and the full database test suite. Get it green. Commit.
5. Supabase clients, middleware, auth pages, onboarding. Commit.
6. `lib/spoilers.ts` with unit tests. Commit.
7. Feed, post page, compose, replies, votes, accept answer. Commit after each screen.
8. Groups, invites, join flow. Commit.
9. Profile, settings, avatar upload, progress, theme toggle. Commit.
10. Search, reports, admin page. Commit.
11. Seed script and seed content. Commit.
12. OG images, metadata, 404, error boundary, security headers. Commit.
13. Component unit tests to reach the coverage threshold. Playwright smoke. Commit.
14. `pnpm check` green. `docs/DEPLOY.md`, `README.md`, `docs/DECISIONS.md` complete.
15. Build report.

If you run low on context or time, the priority is: database and tests, then feed and post and compose, then auth, then groups, then everything else. A working forum with the spoiler gate and no groups is a success. A beautiful shell with no working database is a failure.

## 17. Final report

Write `docs/BUILD_REPORT.md` with:

- What works end to end (list every screen and flow you verified).
- What is stubbed, partial, or untested, with the exact file and what a human must do.
- Coverage numbers from the last run.
- The human checklist to go live (should match `docs/DEPLOY.md`).
- Every place a human should swap a placeholder: logo files, font choices in `lib/theme/fonts.ts`, palette values in `lib/theme/tokens.css`, spoiler level labels in `lib/spoilers.ts`, seed content.
- Three things you would do next.

Then stop.
