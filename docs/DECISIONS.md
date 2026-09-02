# Decisions

One line each: what was chosen, what was rejected, why.

## Database

- **Server owned columns are guarded by a trigger, not by column privileges.** Rejected splitting `vote_count`, `reply_count`, `is_hidden`, and `accepted_reply_id` into side tables. A `before update` trigger that allows the write only when `pg_trigger_depth() > 1` (one of our own triggers) or when a security definer function has set `app.guard_off` is far less schema for the same guarantee, and it is proved by a test.
- **`search_posts` is an invoker rights function, not security definer.** Row level security still applies inside it, so a private group's posts stay out of everyone else's ranked results. `ts_rank` ordering is impossible through PostgREST alone.
- **`set_hidden` and `set_accepted_reply_admin` have execute revoked from `public`.** Only the service role reaches them, and the admin action re-checks `ADMIN_USER_IDS` in Node before calling. Rejected an admin flag on `profiles`, which would be one more thing to get wrong in RLS.
- **The group owner is added as a member by a trigger on `groups`.** Rejected doing it in the server action, because then a group created any other way would have no owner in its roster.
- **Rate limiting is a `before insert` trigger counting the author's last 60 seconds.** Five posts and fifteen replies per minute. Rejected Redis and rejected a token bucket table: a count over an indexed column is enough at this size.
- **`is_group_member` and `can_read_group_content` are security definer helpers.** Without them the `posts` policy would query `group_members`, whose own policy queries `groups`, and Postgres would recurse.

## Spoiler gate

- **One pure function, `applySpoilerGate`, and one module that reads posts and replies.** Every page goes through `lib/queries/`, so no page can reach the database without gating. Rejected gating in each page, which would eventually be forgotten in one of them.
- **A hidden item is a copy with `title` and `body` deleted, not blanked.** A blanked field still tells you the field existed; a length still tells you how long the post is. The unit suite asserts a one character body and a nine thousand character body serialize identically.
- **Reveals are not persisted.** `revealContent` returns rendered markdown and the client holds it in component state. Rejected a `reveals` table: it is state to migrate, to garbage collect, and to leak.
- **Metadata and Open Graph images are generated at level 0 for everyone.** A link preview is seen by people who never chose a progress level, so it can never carry a spoiler. Posts above level 0 get a generic card.

## Markdown

- **A small purpose built renderer instead of a markdown library plus a sanitizer.** Escapes the whole source first, then emits only its own tags, so there is no sanitizer configuration to get wrong and no path for raw user HTML. It supports exactly what the compose help text promises: bold, italic, links, inline and fenced code, and lists. Rejected `marked` plus `DOMPurify`, which is two dependencies, a jsdom shim on the server, and a larger surface than the feature needs.
- **Link hrefs are allowlisted to `http`, `https`, `mailto`, and same site paths.** Anything else renders as literal text.

## Pagination

- **Keyset on `(created_at, id)` for Latest and Unanswered, offset for Top and search.** Top orders by `vote_count` and search by `ts_rank`, neither of which is stable under a keyset cursor. Both are capped at a page size of twenty with a Load more link, so the offset never grows large. Rejected forcing a keyset onto all four, which would mean a compound cursor for a rank that changes between requests.

## Theme

- **The cookie is the provider.** `app/layout.tsx` reads it and sets `data-theme` on `<html>` during the server render, so there is no flash and no React context. Rejected a `ThemeProvider`, which would duplicate what the CSS variables already do.
- **The theme is stored in both the cookie and the profile.** The cookie is what renders; the profile row is what a new device picks up.
- **Open Graph colors are the one duplicate of the palette.** Satori renders outside the document and cannot read CSS custom properties, so `lib/theme/og.ts` holds four hex values with a comment saying to keep them in step. The lint rule is switched off for `lib/theme/**` and nowhere else.

## Layout

- **The context column lives in the app layout and holds the progress control.** Route specific context (group header, topic chips) sits at the top of the content column instead. Rejected parallel routes with a `@context` slot, which would need a `default.tsx` in every branch to render one panel.

## Forms

- **Text fields in the composers are controlled.** React resets an uncontrolled form when a server action runs, which threw away a whole draft post when the server rejected it. Holding the text in state is the fix; the tests cover it.
- **No form library.** No form has more than four fields.

## Testing

- **pglite for the database suite.** Docker is not available in the build environment. `tests/db/supabase-shim.sql` creates the small part of a Supabase project that migrations depend on: an `auth` schema, `auth.users`, `auth.uid()`, and the `anon`, `authenticated`, and `service_role` roles. Grants are written out explicitly in `0006_rls.sql` so the harness gets the same permissions a real project does.
- **`pgcrypto` is not installed in the shim.** pglite does not ship it, and `gen_random_uuid()` and `md5()` are core Postgres.
- **The unit suite mocks the PostgREST builder, not the assertions.** `tests/unit/fake-supabase.ts` records the chain and resolves to a result the test supplies, and every test asserts on what the function returned rather than on which methods were called.
- **Playwright runs against a build with no reachable database.** Every server read comes back empty, so the smoke suite covers the shell, the client side gate demo, form validation, the 404, and the responsive collapse. Content flows are covered by the database suite instead. Mocking Supabase at the network layer does not work here because the reads happen on the server, not in the browser.
- **`PLAYWRIGHT_CHROMIUM_EXECUTABLE`** points the config at a preinstalled Chromium when the sandbox ships a revision that does not match the bundled one.

## Environment

- **`typescript` is pinned to 5.9.** TypeScript 7 is published but `eslint-config-next` and `typescript-eslint` are not yet built against it.
- **`@typescript-eslint/consistent-type-imports` is off.** It needs type aware linting, and `eslint-config-next` ships its own parser that does not forward `parserOptions.project`. Not worth reconfiguring the whole lint pipeline for an import style rule.
