# Build report

Built in one session from an empty repository. `pnpm check` is green, `pnpm build` is green, and the Playwright suite is green.

## What works end to end

Verified by running the app against a build, by the pglite database suite, and by the unit and Playwright suites. Content flows that need a live Supabase project are marked, because this session had no database to point at.

**Verified in a running app**

- Landing page (`/`): hero, sign in and sign up, the slider demo sealing and opening three sample cards live, the safe-to-read preview strip, the disclaimer footer. Redirects to `/feed` when signed in.
- Feed (`/feed`): Latest, Top, and Unanswered tabs, topic filter chips, the empty state, the search box, cursor and page links.
- The shell at 1440, 1024, 768, and 390: rail becomes a bottom bar, the context column drops under the content, no horizontal overflow at any width.
- Dark and light themes, both server rendered from the cookie with no flash on first paint.
- 404 page and the app error boundary.
- Signed out redirects: `/new`, `/settings`, `/g/new`, `/onboarding` all send you to sign in.
- Sign in and sign up pages, magic link form, provider buttons gated behind their flags.

**Verified by the database suite (38 tests, `pnpm test:db`)**

- Profile auto-creation on `auth.users` insert, with a generated `player_` username.
- Username shape and uniqueness constraints.
- Vote counts through insert, flip, and delete. Reply counts through insert and delete. Member counts and owner auto-membership.
- Report auto-hide at exactly five distinct reporters, not at four, and not at five attempts from one reporter.
- The post rate limit at five per author per minute.
- Private group posts invisible to non-members through select, through ranked search, and through counts. The private group row itself invisible too.
- Members can post in a group, non-members cannot, nobody can post as somebody else.
- Nobody can update another user's post or profile.
- Clients cannot write `vote_count`, `reply_count`, `is_hidden`, or `accepted_reply_id` on posts, or `vote_count` or `is_hidden` on replies.
- Direct writes to `votes` are refused; `cast_vote` upserts, flips, clears on zero, and refuses a target the caller cannot read.
- `accept_reply` refuses non-authors and foreign replies, and leaves the column guard armed afterwards.
- `join_group_by_invite` joins, and refuses unknown and expired codes.
- `set_progress` validates its range and refuses anonymous callers.
- `set_hidden` is unreachable without the service role.
- Ranked search still enforces row level security.

**Verified by the unit suite (212 tests, `pnpm test`)**

- The gate at every one of the 64 viewer and item level combinations, that it strips title and body, that it leaks no length, and that it does not mutate its input.
- Every zod schema, valid and invalid.
- Every component state: visible card, sealed placeholder, revealed content, reveal failure, empty states, vote states, form errors, and the accepted answer treatment.
- Every server action's returned `ActionResult`, including the friendly text each database error maps to.
- That `listPosts`, `getPost`, `listReplies`, and `listRepliesByAuthor` gate everything they return, including the search path.

**Not exercised against a live database in this session**

Sign up, onboarding, posting, replying, voting, accepting an answer, avatar upload, group creation, invite generation and redemption, and the reports queue all have their SQL proved by the database suite and their action logic proved by the unit suite, but the round trip through a real Supabase project has not been run. Step 5 of `docs/DEPLOY.md` lists exactly what to click through once you have keys.

## Coverage, from the last run

```
Statements   : 89.79% ( 642/715 )
Branches     : 85.22% ( 548/643 )
Functions    : 94.52% ( 138/146 )
Lines        : 90.69% ( 565/623 )
```

Threshold in `vitest.config.mts` is 80 percent lines and branches, enforced, so `pnpm test` fails below it. Coverage covers `lib/`, `actions/`, and `components/`. Excluded: `lib/theme/fonts.ts` (a `next/font` call), `lib/supabase/**` (client construction, exercised by everything else).

Test counts: 212 unit, 38 database, 20 Playwright across desktop and mobile.

## Stubbed, partial, or untested

| What | Where | What a human has to do |
| --- | --- | --- |
| Discord and Google sign in | `app/auth/actions.ts`, `components/form/AuthForm.tsx` | Add provider credentials in Supabase Auth, then set `NEXT_PUBLIC_AUTH_DISCORD_ENABLED` or `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` to `true`. The code path is complete; the buttons render only when the flag is on. |
| Storage bucket | `supabase/migrations/0007_storage.sql` | The migration creates and configures the `avatars` bucket, but some projects refuse storage DDL. If yours does, `docs/DEPLOY.md` has the four click version. |
| Admin list | `ADMIN_USER_IDS` | Empty by default, so `/admin/reports` 404s for everyone. Paste your auth user uuid after you sign up. |
| Seed passwords | `seed-credentials.local.json` | Each seed account gets a random password per run, printed once and written to that gitignored file. Delete the accounts before real users arrive. |
| Playwright content coverage | `tests/e2e/` | The suite runs against a build with no reachable database, so it covers the shell and the client side gate rather than posting and replying. Point it at a seeded Supabase project to extend it. |
| Chromium revision | `playwright.config.ts` | `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is read when set, for sandboxes whose preinstalled Chromium does not match the bundled revision. On a normal machine, `pnpm exec playwright install chromium` and ignore it. |

## Go live checklist

Same as `docs/DEPLOY.md`, in short:

1. Create the Supabase project, copy the URL, anon key, service role key, and reference id.
2. `cp .env.example .env.local` and fill it in.
3. `supabase link --project-ref <ref>` then `pnpm supabase:push`.
4. `pnpm seed`.
5. Supabase Auth: set the Site URL, add `/auth/callback` redirect URLs for localhost, the Vercel domain, and your domain, and decide whether email confirmation is on.
6. Import into Vercel, add the same environment variables with `NEXT_PUBLIC_SITE_URL` set to the deployed origin, deploy.
7. Sign up, copy your user's uuid into `ADMIN_USER_IDS`, redeploy.

## Placeholders a human should swap

| What | File | Note |
| --- | --- | --- |
| Palette | `lib/theme/tokens.css` | Every color, radius, shadow, and layout width. Nothing else in the codebase declares a color, and `pnpm lint` fails if anything tries. |
| Open Graph palette | `lib/theme/og.ts` | Four hex values, the one deliberate duplicate. Satori cannot read CSS custom properties. Keep them in step with the tokens by eye. |
| Fonts | `lib/theme/fonts.ts` | Currently Bricolage Grotesque for display, Source Sans 3 for body, JetBrains Mono for code. Change the imports and the file is done. |
| Wordmark | `components/brand/Wordmark.tsx` | Original SVG built from the display face plus one accent rule. |
| Square mark | `components/brand/Mark.tsx` | Used as the avatar fallback. |
| Favicon | `app/icon.svg` | Standalone copy of the mark, so it needs the same swap. |
| Spoiler level labels | `SPOILER_LEVELS` in `lib/spoilers.ts` | Rename Chapter 1 through Chapter 6 once the real story structure is public. The count stays at eight, and the database check constraints assume 0 to 7. |
| Seed content | `supabase/seed/content.ts` | Written from Trailer 1, Trailer 2, and the store listings only. Replace it before launch, or delete the seed accounts. |
| Disclaimer copy | `app/(marketing)/page.tsx` and `components/shell/NavRail.tsx` | Two places say the site is unofficial. |

## Three things to do next

1. **Point the Playwright suite at a seeded Supabase project.** The shell is covered; the flows that matter (post, reply, vote, accept, reveal, invite) are only covered at the SQL and action layers. A single seeded project used as a test fixture would close the last gap between the unit suite and the real thing.
2. **Add a notification of any kind for accepted answers and replies.** The forum works, but nothing brings a person back. One in-app inbox that reads from `replies` where the post author is you, gated exactly like everything else, is a small amount of code and the largest behavioral change available.
3. **Rework Top to use a decaying score instead of a seven day window.** The current tab is `vote_count` over the last week, which will look flat before launch and lumpy after. A `vote_count / (age + 2)^1.5` ordering computed in SQL would make the tab useful at both traffic levels, and it removes the offset pagination this decision forced.
