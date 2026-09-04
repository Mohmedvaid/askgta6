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
  auth/            sign in, sign up, OAuth, callback, sign out
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
  seed/            seed.json, its schema, and the importer
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

- Email and password. Discord and Google behind their flags.
- **Password reset** is the self service way back into an account. `/auth/forgot` takes an email and always answers the same way, whether or not that address has an account, because an unauthenticated endpoint that says "no such account" is a free membership list. The action is behind `PASSWORD_RESET_ENABLED` in `lib/auth-features.ts`, default true, and flipping it false stops the send without changing what the page says.
- **The recovery session gate.** Supabase issues an ordinary session for a reset link, with nothing server side to mark it. So `/auth/callback` sets a short lived httpOnly marker cookie when, and only when, the `next` it was given is `/auth/reset`, and that page requires both the marker and a session. Without it, `/auth/reset` would be a change password form any signed in reader could reach by typing the URL. The marker is cleared the moment the password changes, so a back button cannot replay it. `next` is also validated as a same site path, because it arrives on the query string.
- **Magic link is disabled**, September 2026, pending confidence in the new SMTP sender. The action in `app/auth/actions.ts` is intact and still covered by tests that mock the flag back on, the form is gone from `components/form/AuthForm.tsx`, and `MAGIC_LINK_ENABLED` in `lib/auth-features.ts` is false so a stray post reaches nothing. Re-enabling is both: flip the flag, restore the form.
- Sessions live in cookies, written by `@supabase/ssr`. `middleware.ts` refreshes them so a server render never sees a stale session.
- Every auth redirect is built by `authCallbackUrl()` in `lib/auth-callback.ts` and nothing else. It prefers the origin the request actually arrived on, from `x-forwarded-host` and `x-forwarded-proto`, over `NEXT_PUBLIC_SITE_URL`, because the variable is baked in at build time and can be stale. It always appends `/auth/callback`, ignores a loopback origin outside development, and throws in production rather than mailing a link to localhost. `tests/unit/auth-redirect.test.ts` scans the source and fails if any auth call builds a redirect by hand.
- **That exact origin still has to be in the Supabase redirect allow list.** When it is not, Supabase discards it and substitutes its own Site URL, which is a bare origin with no path, so the link lands on the wrong host and never reaches the callback. Getting the app side right does not help until **Authentication, URL Configuration** lists the domain.
- `/auth/callback` exchanges the code for a session, adopts the guest shield cookies onto the new profile, and redirects on. OAuth and email confirmation both land here, which is why cookie adoption happens in the route as well as in the signup action.
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

## Outbound links and spam

- **Every user authored link carries `rel="nofollow ugc noopener"` and `target="_blank"`.** The rel string lives once, in `lib/links.ts`, and `lib/markdown.ts` is the only thing that emits an anchor. A forum with an open compose box is worth nothing to a link seller, and a target page never gets control of the tab it opened from.
- **Links stay links.** Nothing unfurls, embeds, or fetches a URL, so a posted address cannot become media on the page. There are no image uploads in posts either; avatars are the only thing stored.
- **Link privileges.** An account under 24 hours old with no accepted answer and fewer than 3 upvotes received cannot include a link, in a post or a reply, in the body or the title. Either bar clears it, not both: an answer accepted an hour after signing up has demonstrated more than a day of silence. Admins are exempt, because moderating means linking to things. `lib/link-privilege.ts`, counted by `public.link_privilege_stats`.
- **The spam filter**, `lib/spam.ts`, runs on create and edit of posts and replies. Three rules: a blocked domain (subdomains count), a blocked phrase against the normalized body, and an identical normalized body from any account inside 60 minutes.

  **A match does not refuse.** The item is saved, then hidden, and a report is filed against it with a note naming the rule, so it lands in the admin queue. A refusal tells a spammer exactly which word to change, and leaves no record of what was caught, so nobody can tell an over eager rule from an effective one.

  Both lists are tables, seeded in migration `0013` with URL shorteners, paste sites, and the usual scam bait, and editable from the admin content screen with an audit row per change.

## Identity

- **The username is the identity**, on cards, on replies, in the profile URL, and in structured data. The display name is optional and secondary; it shows next to a username, never instead of one.
- **A username changes once every 30 days**, 3 to 20 characters of lowercase letters, digits, and underscores. The cooldown is in the action and in a database trigger, because the action is not the only thing that can reach a profile row. The old name is freed immediately: reserving it would be a squatting mechanism.
- Moving off the generated `player_xxxxxx` name neither spends the cooldown nor starts the clock, so a name typed in a hurry at onboarding gets one free correction.
- **Email cannot be changed by anybody.** There is no field in settings and no action passes one to `updateUser`, which `tests/unit/profile-rules.test.ts` asserts by scanning the source. Changing the address on an account is how a stolen session becomes a stolen account.
- Profiles carry a bio of up to 200 characters, capped by a check constraint as well as by the schema. Admins can rename any account and clear any bio from the users screen, both audited.

## Moderation

- Anyone signed in can report a post or reply. Reasons: `spam`, `leak`, `harassment`, `wrong_spoiler_level`, `spoiler_in_title`, `other`. One report per person per item, enforced by a unique constraint.
- A database trigger sets `is_hidden = true` on the target once **five distinct reporters** have filed. Four does not fire it, and five attempts from one person cannot, because of the unique constraint.
- Hidden content is visible only to its author, by row level security.
- **Admin is `profiles.is_admin`**, a column rather than an environment variable, because row level security can read a column and cannot read a Vercel variable. `public.is_admin()` is what the policies call.
- `/admin` is gated once in its layout and again in every action, because a server action is its own entry point. It has four screens: an overview of signups, posts, and replies per day for 30 days plus totals, the report queue, user search, and recent posts and groups.
- **Every admin action writes a row to `admin_actions`**, with the service role key, because that table takes no client writes at all: an audit trail a moderator can forge is not an audit trail.
- **Banning is enforced by Postgres, not the UI.** `public.is_banned()` sits inside the insert policies for posts, replies, groups, and reports, and inside `cast_vote`, which is `security definer` and so bypasses policies. A banned account can still read.
- That is the entire moderation system. There is no roles table.

## Rate limits

Enforced by `before insert` triggers counting the author's last 60 seconds:

- **5 posts per author per minute**
- **15 replies per author per minute**

Exceeding either raises, and the server action maps it to "You are posting too quickly. Wait a minute and try again." Feed pages are 20 items with a Load more link, never infinite scroll.

These numbers are tuned for a quiet forum. Review them before a launch spike; that is on the backlog.

**Cloudflare Turnstile** is on signup, sign in, and both composers behind `NEXT_PUBLIC_TURNSTILE_ENABLED`. Off, the widget renders nothing and the server skips verification. On, a missing or failing token is a refusal, except when Cloudflare itself is unreachable, where it fails open so an outage there is not an outage here. Enabled without a secret fails closed, because failing open would make the flag a lie.

**A per IP signup limit**, five an hour, counted by `public.record_signup_attempt` in Postgres. The table holds a salted hash and a timestamp, never an address, and has no row level security policies at all, so only that `security definer` function can reach it.

Signup and both composers carry a honeypot: a field named `website`, moved off screen rather than hidden so a form filler still fills it, out of the tab order and out of the accessibility tree so a person never meets it. A tripped signup gets the answer a real one gets and nothing happens. A tripped post or reply gets a generic failure and writes nothing. 

## Storage

One bucket, `avatars`, created by migration `0007`. Public read, 2 MB limit, PNG, JPEG, WebP and GIF only. Write, update and delete are limited to objects whose first path segment equals the uploader's user id, so nobody can overwrite anyone else's avatar. Avatars are the only thing stored; posts have no image uploads.

If a Supabase project refuses that migration on storage permissions, [history/DEPLOY.md](../history/DEPLOY.md) has the four click version.
