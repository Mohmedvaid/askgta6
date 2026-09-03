# Night 2

September 3, 2026. Eight numbered items, each its own commit, `pnpm check` green
before every push. No migration was written and none was applied; the database is
still at `0011`. Supabase itself stayed unreachable from this container, so every
number below comes from a local production build against an unreachable project,
which means every page rendered empty.

## What landed

### 1. One Supabase client per request

The premise was fifteen auth calls a page. That was not what was happening.
`getViewer` was already wrapped in React's `cache()` and is the only caller of
`auth.getUser` outside middleware, so the auth call was already once per request.

What was running forty two times was `createSupabaseServerClient`: every query
module and every action called it, and each call awaited `cookies()` and built a
fresh client that resolved the session again. That is cached now too.

`tests/unit/request-cache.test.ts` supplies the request scope itself, because
React's `cache` only dedupes inside the RSC renderer and vitest cannot host one.
It counts client constructions, `auth.getUser` calls, and `profiles` reads across
the sequence a signed in reader's post page makes, and it scans the source to pin
`auth.getUser` to the two files allowed to have it. That scan is the regression
that would actually happen: someone adding a direct `getUser` inside a query.

### 2. A landing page that describes the shield it ships

The hero said every post past your chapter stays sealed. That is false for a first
time visitor, because the shield is opt in and off. The demo was a slider over
three cards, which taught the old model.

The hero now leads with the forum reading in full by default. The demo is one post
rendered twice through the real gate, off on one side and on at chapter 0 on the
other, so it has no state and is a server component.

### 3. JSON-LD

`lib/structured-data.ts`. A question with an accepted answer both reader and
crawler can see is a `QAPage` with `acceptedAnswer`; everything else is a
`DiscussionForumPosting` with `interactionStatistic` counters. Public groups get a
`CollectionPage`. Null unless the page is indexable, and no branch can carry a
gated body because the gate deleted it before the page saw it. `components/seo/JsonLd`
escapes `<` so a title cannot close the script tag.

### 4. RSS

`/feed.xml` and `/g/[slug]/feed.xml`. Titles, links, authors, dates, and nothing
else: no item has a description and the query never selects a body, because a feed
reader has no shield. Level 0 rows only for the same reason. Empty while indexing
is off, exactly as the sitemap is, and the `link rel=alternate` only appears when
the flag is on.

### 5. Performance

The landing page is prerendered now, revalidated every ten minutes. Two things had
made it dynamic: the root layout read the theme cookie, which made every route in
the app dynamic for one attribute, and the page read posts through the cookie
carrying client. The theme is now a pre-paint script in the body, and the posts
come from a cookie free client.

Lighthouse, local production build, mobile preset:

| | performance | FCP | LCP | TBT | TTFB | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| landing before | 87 | 1.2 s | 3.3 s | 200 ms | 150 ms | 0 |
| landing after | 96 | 0.8 s | 2.8 s | 60 ms | 20 ms | 0 |
| feed before | 96 | 0.8 s | 2.8 s | 50 ms | 50 ms | 0 |
| feed after | 94 | 0.8 s | 2.9 s | 70 ms | 40 ms | 0 |

Accessibility 93 on the landing and 100 on the feed, unchanged. SEO 63 on both,
which is correct while indexing is off. The feed number moves a few points between
runs and the skeleton is pure cost in this measurement, because an unreachable
database fails instantly and there is no latency for it to hide.

Also: independent reads run together in the app layout, the post page, and the
group page, and avatars go through `next/image` with the Supabase storage host
allowed in `next.config.ts`.

### 6. Abuse

A honeypot on signup, magic link, and both composers. Off screen rather than
`display:none` so a form filler still fills it, out of the tab order and out of
the accessibility tree. A tripped signup or magic link gets exactly the answer a
real one gets and nothing happens; a tripped post or reply gets a generic failure
and writes nothing.

### 7. Three design directions

`docs/design/` holds three complete `tokens.css` replacements with rationales, and
twenty four screenshots covering landing, feed, and post at 1440 and 390 for each
plus the current theme. Vice is loud and violet, Broadsheet is editorial and warm,
Terminal is quiet and near neutral.

## What was skipped, and why

### The per IP signup rate limit

It needs a table. The existing Postgres pattern in migration `0003` counts rows a
signed in person already owns; a signup has no such row and no owner. Tonight was
under a no new migrations rule, so the whole proposed `0012` is written out in
[../BACKLOG.md](../BACKLOG.md): the table, the index, row level security with no
policies, and a `security definer` function that keeps an IP hash rather than an
IP. Supabase Auth enforces its own per IP limits on the hosted side meanwhile.

### A `loading.tsx` for the post route

Written, then removed. That boundary flushes a 200 shell before `getPost` has run,
so every missing post became a 200 for a crawler. The Playwright suite caught it
within a minute of the change. The post page streams its replies behind an inner
`<Suspense>` instead, which keeps the 404 and still paints the post first. The
structured data moved in with the replies, because a `QAPage` needs the accepted
answer.

### Everything that needs the live project

No migration was applied, no seed was run, and no Lighthouse run saw real content.
The container cannot reach `*.supabase.co`. Every number here is the shell.

## The state it is in

- 403 unit tests, 41 database tests, 38 Playwright tests, all green.
- Coverage 91.5 percent statements, 92.4 percent lines, against an 80 percent floor.
- Database at migration `0011`. Nothing tonight touched the schema.
- `NEXT_PUBLIC_INDEXING` still `off` in production. The JSON-LD and both feeds are
  therefore inert until it is turned on, which is deliberate: they were built now so
  that flipping the flag is one switch rather than a project.
