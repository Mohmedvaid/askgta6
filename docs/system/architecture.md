# Architecture

How it works, from the request in to the row out.

## Stack

- Next.js 16, App Router, TypeScript strict. React Server Components by default; client components only where something has to react to a click.
- Supabase for Postgres, Auth, and Storage. Row level security on every table, deny by default.
- `@supabase/ssr` for the server and browser clients. All mutations are Server Actions. There is no API layer, no tRPC, no Express.
- Tailwind v4, with every visual value coming from CSS custom properties in `lib/theme/tokens.css`.
- Vitest for unit and database tests, Playwright for a browser smoke suite, pnpm as the package manager.

No state management library, no ORM, no component library, no form library.

## Repo layout

```
app/
  (marketing)/     the landing page, logged out
  (app)/           everything behind the shell: feed, post, compose, groups, profile, settings, admin
  auth/            sign in, sign up, magic link, OAuth, callback
  robots.ts        crawler policy, driven by NEXT_PUBLIC_INDEXING
  sitemap.ts       empty while indexing is off
  feed.xml/        RSS for the site, level 0 posts only
components/        one component per file, grouped by concern
lib/
  spoilers.ts      the levels, the shield default, and applySpoilerGate
  viewer.ts        who is reading and what their shield says
  queries/         the only place posts and replies are read
  indexing.ts      what may be indexed and what never may
  structured-data.ts  JSON-LD for post and group pages
  rss.ts           the RSS document, and the response it is served in
  site.ts          siteUrl and absoluteUrl, the only origin in the app
  honeypot.ts      the hidden field, and whether it was filled
  auth-errors.ts   Supabase auth codes to copy a person can act on
  validation.ts    a zod schema per mutation
  theme/           tokens.css, fonts.ts, and the Open Graph palette
  supabase/        server, browser, admin, public, and middleware clients
actions/           server actions, one file per domain
supabase/
  migrations/      numbered SQL, applied in filename order
  seed/            pnpm seed
tests/
  unit/            pure helpers, schemas, component states, action outcomes
  db/              pglite harness and the row level security suite
  e2e/             Playwright
```

## Request flow

1. `middleware.ts` runs on every request that is not a static asset. It calls `updateSession`, which refreshes the Supabase auth cookie so server components see a live session, and sends a signed in reader from `/` to `/feed`, because the landing page is prerendered and cannot decide that itself.
2. The page's layout calls `getViewer()` and `getShieldState()`.
3. The page calls something in `lib/queries/`, which reads through the request scoped Supabase client. Row level security decides what rows come back.
4. Every post and reply passes through `applySpoilerGate` on the way out of `lib/queries/`. A page cannot reach the database without it.
5. Mutations go through a Server Action, which validates with a zod schema from `lib/validation.ts` and returns `{ok: true, data} | {ok: false, error}`. Nothing throws across the boundary.

## Auth

- Email and password, magic link, and Discord and Google behind their flags.
- Sessions live in cookies, written by `@supabase/ssr`. `middleware.ts` refreshes them so a server render never sees a stale session.
- Signup and magic link pass `emailRedirectTo` built as `NEXT_PUBLIC_SITE_URL` plus `/auth/callback`. That exact origin has to be in the Supabase redirect allow list or Supabase refuses the request.
- `/auth/callback` exchanges the code for a session, adopts the guest shield cookies onto the new profile, and redirects on. OAuth and magic link both land here, which is why cookie adoption happens in the route as well as in the signup action.
- A profile row is created by a database trigger the moment an `auth.users` row appears, with a generated `player_xxxxxx` username. Onboarding replaces it. Signup never fails on a missing profile.
- Signing out is one server action, reachable from the account menu in the header and the bottom of settings. It clears the session and returns to the landing page.
- Every auth action logs the Supabase code, status, and message with `console.error`, and never an email, token, or password. Known codes map to specific copy in `lib/auth-errors.ts`; unknown codes keep a generic message rather than leaking internals.

## The spoiler shield, end to end

**The shield is opt in.** `SPOILER_SHIELD_DEFAULT` in `lib/spoilers.ts` is `false`. A reader who has not turned it on sees every post and reply in full.

### Where the state lives

- **Guests:** two cookies, both one year, `SameSite=Lax`. `askgta6_shield` holds `on` or `off`, `askgta6_progress` holds the level. Two cookies rather than one packed value, so switching the shield off and back on lands where you were.
- **Accounts:** two columns on `profiles`, `spoiler_shield` (boolean, default false) and `progress` (smallint, 0 to 7).
- Signing up copies the guest cookies onto the new profile and clears them. After that the profile is the only source.

### How it is read

`getViewerProgress()` in `lib/viewer.ts` is the single reader. It returns either a level, or the `NO_GATING` sentinel when the shield is off. `NO_GATING` is the string `"none"`, deliberately not a number, so no call site can compare it against a level by accident and TypeScript forces every one to handle it.

### How it is applied

`applySpoilerGate(item, viewerProgress)` is pure and lives in `lib/spoilers.ts`.

- `NO_GATING`, or the item at or below the reader's level: the item comes back whole, `hidden: false`.
- Above the reader's level: `body` is deleted and `hidden: true` is set. Deletion runs at **any depth**, so an embedded row cannot smuggle prose through.
- **Titles are always visible.** So are topic, kind, author, vote and reply counts, timestamp, and the spoiler level badge. A card with no title tells a reader nothing, so they open it to find out, which is the opposite of what the gate is for.
- No blanked body and no body length. A one character body and a nine thousand character body serialize identically.

The cost of visible titles is that a spoiler in a title is unguarded. The composer says "Keep spoilers out of titles. Titles are always visible." under the title field, and `spoiler_in_title` is its own report reason.

### Revealing

`revealContent` returns the body once. It is held in component state, never persisted, and never moves the reader's chapter. There is no reveals table.

### The control

One pill in the header: "Spoiler shield: off", or the chapter it is holding you at. Clicking opens a popover with a toggle and the chapter list. Every change saves immediately and calls `router.refresh()`, so the feed re-gates without a page load. The settings page renders the same `ShieldControls` component, so the two cannot disagree.

## Indexing

`NEXT_PUBLIC_INDEXING` is `off` in production. While off: `robots.txt` disallows everything, the sitemap is empty, every page emits `noindex, nofollow, nocache`, and `next.config.ts` adds an `X-Robots-Tag` header to every response.

Set to `on`, these become indexable: the landing page, the feed, public groups, public profiles, and every public post whatever its spoiler level, because every post has a readable title. A feed search result page stays noindex even then, since arbitrary query permutations are index bloat.

### Permanently noindex, whatever the flag says

`/auth/*`, `/settings`, `/admin/*`, `/new`, `/g/new`, `/g/*/new`, `/g/join/*`, `/onboarding`, private group pages, posts inside private groups, moderation hidden posts, and the 404 and error pages.

That list holds through three independent layers: explicit `robots: NOINDEX` in each page's metadata, path matched `X-Robots-Tag` headers from `next.config.ts`, and `robots.txt` disallow entries. One edit to the root default cannot silently open the admin queue.

Noindex is the root layout default and indexable pages opt in, because forgetting an opt out leaks a page while forgetting an opt in only costs traffic.

## One client, one lookup, per request

`createSupabaseServerClient` and `getViewer` are both wrapped in React's `cache()`, so a whole page render shares one client and one `auth.getUser` call however many of the forty odd call sites ask. `getViewer` is the only caller of `auth.getUser` outside `lib/supabase/middleware.ts`, which runs in its own request context before any cache scope exists; `tests/unit/request-cache.test.ts` asserts that and counts the calls across a simulated page tree.

`lib/supabase/public.ts` is the exception: a client with no session and no cookies. Reading cookies is what makes a route dynamic, so anything prerendered reads through that one instead.

## Rendering

- **The landing page is static**, revalidated every ten minutes. Its posts come from `listLandingPosts` through the cookie free client, and the signed in redirect is in middleware.
- The root layout reads no cookies. `data-theme="dark"` is served, matching `:root` in `tokens.css`, and `THEME_BOOTSTRAP` in `lib/theme/cookie.ts` runs as the first thing in the body to switch a light reader over before anything is painted. That is what keeps every route eligible to be prerendered.
- The feed and group routes have a `loading.tsx`. **The post route deliberately does not.** That boundary flushes a 200 shell before `getPost` has run, which turns every missing post into a 200 for a crawler; the Playwright suite catches it. The post page streams its replies behind an inner `<Suspense>` instead, which keeps the 404 and still paints the post first.
- Avatars go through `next/image`. The Supabase storage host is allowed in `next.config.ts`; without that entry the component throws rather than falling back.

## Syndication and structured data

- **JSON-LD**, from `lib/structured-data.ts`, rendered by `components/seo/JsonLd`. A question with an accepted answer both reader and crawler can see becomes a `QAPage`; everything else is a `DiscussionForumPosting` with `interactionStatistic` counters for votes and replies. Public groups get a `CollectionPage`. It returns null unless the page is indexable, and no branch can carry a gated body because the gate deleted it before the page saw it.
- **RSS** at `/feed.xml` and `/g/[slug]/feed.xml`. Titles, links, authors, dates. No item has a description and nothing carries a body: a feed reader has no shield, so the query takes level 0 rows only and never selects a body. Both are empty while indexing is off, the way the sitemap is, and the `link rel=alternate` that advertises them only appears when the flag is on.

## Moderation

- Anyone signed in can report a post or reply. Reasons: `spam`, `leak`, `harassment`, `wrong_spoiler_level`, `spoiler_in_title`, `other`. One report per person per item, enforced by a unique constraint.
- A database trigger sets `is_hidden = true` on the target once **five distinct reporters** have filed. Four does not fire it, and five attempts from one person cannot, because of the unique constraint.
- Hidden content is visible only to its author, by row level security.
- Users whose uuid is in `ADMIN_USER_IDS` can open `/admin/reports` to hide, unhide, or delete. The check runs server side on every call, and the hide path goes through a `security definer` function whose execute permission is revoked from `public`.
- That is the entire moderation system. There is no roles table.

## Rate limits

Enforced by `before insert` triggers counting the author's last 60 seconds:

- **5 posts per author per minute**
- **15 replies per author per minute**

Exceeding either raises, and the server action maps it to "You are posting too quickly. Wait a minute and try again." Feed pages are 20 items with a Load more link, never infinite scroll.

These numbers are tuned for a quiet forum. Review them before a launch spike; that is on the backlog.

Signup, magic link, and both composers carry a honeypot: a field named `website`, moved off screen rather than hidden so a form filler still fills it, out of the tab order and out of the accessibility tree so a person never meets it. A tripped signup or magic link gets the answer a real one gets and nothing happens. A tripped post or reply gets a generic failure and writes nothing. There is no per IP signup limit yet; the proposed migration for one is written out in [../BACKLOG.md](../BACKLOG.md).

## Storage

One bucket, `avatars`, created by migration `0007`. Public read, 2 MB limit, PNG, JPEG, WebP and GIF only. Write, update and delete are limited to objects whose first path segment equals the uploader's user id, so nobody can overwrite anyone else's avatar. Avatars are the only thing stored; posts have no image uploads.

If a Supabase project refuses that migration on storage permissions, [history/DEPLOY.md](../history/DEPLOY.md) has the four click version.
