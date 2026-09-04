# Post-mortem: askgta6

Written 2026-09-04, against `c579e91`. 39 commits, one contributor, all sessions
Claude Code. 8,440 lines of app code (`app` 2,247, `components` 2,576, `lib`
2,731, `actions` 886), 1,410 lines of SQL migrations, 10,111 lines of tests,
2,363 lines of docs.

Every claim below cites a file or a commit. Where a section had nothing real in
it, it says so.

---

## 1. What worked

**Custom lint rules as architecture enforcement.** `eslint-local/no-raw-color.mjs`
forbids color literals and Tailwind default palette classes everywhere except
`lib/theme/**`. The result is that `docs/BACKLOG.md` can honestly say a rebrand is
a swap of one file, and the claim is checkable rather than aspirational. This is
the single highest leverage thing in the repo: 60 lines of lint rule bought a
guarantee that no amount of review discipline would have held across 39 commits.

**Tests that scan source, not just behavior.** `tests/unit/auth-redirect.test.ts`
reads `app`, `actions`, `lib`, and `components` off disk and asserts that every
`signUp`, `signInWithOtp`, `signInWithOAuth`, `resetPasswordForEmail`, and
`resend` call is passed `await authCallbackUrl()`, that no `emailRedirectTo` is
assigned anything else, and that the callback path is built in exactly one file.
`tests/unit/request-cache.test.ts` does the same for `auth.getUser`, pinning it
to the two files allowed to call it. These catch the regression that actually
happens — someone adding a second code path — which a behavioral test never does.

**One gate function, one read module.** `applySpoilerGate` in `lib/spoilers.ts`
is the only place content is redacted, and `lib/queries/` is the only place pages
read the database. Recorded as a deliberate rejection of per-page gating in
`docs/history/DECISIONS.md`. When the leak in section 2 was found, there was
exactly one function to fix.

**A hidden item is a copy with the field deleted, not blanked.** `lib/spoilers.ts`
deletes `body` rather than emptying it, and `tests/unit/spoilers.test.ts` asserts
that a 1-character body and a 9,000-character body serialize identically. A
blanked field still leaks length.

**pglite instead of Docker for the database suite.** `tests/db/harness.ts` boots
Postgres in-process, applies `tests/db/supabase-shim.sql` (auth schema,
`auth.users`, `auth.uid()`, the three roles), then every migration in order. 112
tests run against real Postgres with real RLS in 88 seconds with no daemon. It
also means migrations are executed on every test run, so a syntax error in
`supabase/migrations/*.sql` fails `pnpm check` before it reaches production.

**Spam and blocklists as tables, not constants.** `blocked_domains` and
`blocked_phrases` in `supabase/migrations/0013_spam_and_profiles.sql`, edited from
`/admin` via `components/admin/BlockListEditor.tsx` with an `admin_actions` audit
row per change. This is the only piece of business config in the repo that is
data. Section 5 is the list of everything that is not.

**A single `pnpm check` gate.** `package.json:15` chains typecheck, lint, unit,
and db. Every feature commit in the history ran it. The one class of failure it
misses is documented in section 4.

**Migration comments that forbid the mistake that was already made once.**
`supabase/migrations/0012_admin_and_abuse.sql:88` says "This is 0005's function
verbatim with four lines added. Do not rewrite it from memory." That comment
exists because rewriting `cast_vote` from memory dropped its readability checks
and the db suite caught it.

**Deliberate rejections written down.** `docs/history/DECISIONS.md` records what
was chosen *and what was rejected* one line each. It is the only doc that
answered "why is it like this" in later sessions. See section 6 for what went
wrong with it.

---

## 2. Mistakes and rework

**A sealed reply shipped its parent post's title to the browser.**
`fc23a84`. `listRepliesByAuthor` embedded the parent post row, and
`applySpoilerGate` only stripped the reply's own `title` and `body`, so a gated
reply on a late-game thread carried that thread's headline in the payload.
Nothing rendered it, which is why review missed it.
*Root cause:* the redactor operated on the top level of an object while the query
layer was free to nest arbitrary rows inside it.
*Rule:* a redactor must walk the whole object graph, and the test for it must
assert on the serialized payload, not on rendered output.

**`loading.tsx` turned every missing post into a 200.** `28c8f2f`. The post route
had a `loading.tsx`; that boundary flushes a 200 shell before `getPost` runs, so
`notFound()` could no longer set the status. Playwright caught it; no unit test
could have.
*Root cause:* a framework file convention silently changed the HTTP contract of a
route.
*Rule:* every route that can 404 gets a test asserting the status code, not the
rendered body. `tests/e2e/smoke.spec.ts:112` is that test.

**Magic links pointed at localhost from production.** `919bad5`. Auth redirects
were built from `NEXT_PUBLIC_SITE_URL`, which is inlined at build time, and the
real cause turned out to be the Supabase redirect allow list silently
substituting its Site URL. Cost: a live bug on the public domain plus a full
audit of every auth call site.
*Root cause:* one input (a build-time env var) was trusted over a better one (the
request's own origin), and a dashboard setting outside the repo could override
the app entirely.
*Rule:* derive the origin from the request (`x-forwarded-host`/`x-forwarded-proto`)
and treat the env var as fallback only; and when a redirect misbehaves, check the
provider's allow list before auditing code.

**The landing page described a feature the app no longer had.** `4cc5549`. The
hero said "every post past your chapter stays sealed" months after `2fa54b9` made
the shield opt-in and off by default. The `SpoilerDemo` component taught the old
model with a slider over fake cards.
*Root cause:* marketing copy and the behavior it describes were in different
files with no link between them.
*Rule:* landing-page demos render the real function over real data
(`SpoilerDemo` now calls `applySpoilerGate` twice), so copy that drifts fails a
test instead of lying.

**The seed system was written, then thrown away 2 days later.** `93cd0c4` deleted
`supabase/seed/seed.ts` (280 lines), `content.ts` (278), `avatars.ts` (25) — 583
lines built in `c93c1fd` and replaced wholesale when real content arrived as
`seed.json`.
*Root cause:* placeholder content was built as code before it was known whether
the content would be authored in code.
*Rule:* seed content is data from day one. The importer reads a file; it never
contains the content.

**The seed importer's deterministic ids collided with existing rows.** `cc03d50`.
`importGroups` upserted on `id = uuidv5("group:"+slug)`, but the old seed had
created those slugs with random uuids and `slug` is unique, so the first
production run died on `groups_slug_key`.
*Root cause:* a natural key (`slug`) and a synthetic key (`uuidv5`) both claimed
to identify the same row.
*Rule:* when a table has a natural unique key, that key is the identity for
import. Look up by it, adopt what exists, and only mint an id for a key that has
never been seen.

**A shared seed password was committed.** `bc08036` replaced a constant in
`supabase/seed/seed.ts` with per-run random passwords written to a gitignored
`seed-credentials.local.json` at mode 600.
*Root cause:* "it's only test data" applied to a credential in version control.
*Rule:* no password literal in the repo, including seeds and fixtures.

**Dead code shipped and was removed later.** `0018535` deleted `getReply`,
`editReply`, and `replyEditSchema` — nothing in the app called them and no screen
in the spec edits a reply. `2fa54b9` deleted `ProgressPanel` (31 lines),
`ProgressSheet` (103), and `tests/e2e/progress.spec.ts` (98) when the onboarding
sheet was cut.
*Root cause:* symmetry. `getPost`/`getReply`, `editPost`/`editReply` were built as
pairs because they looked like pairs, not because both were needed.
*Rule:* build the caller first. No exported function lands without a caller in the
same commit.

**Built and never used, still live:** Cloudflare Turnstile (`lib/turnstile.ts`,
`components/form/Turnstile.tsx`, wired into four forms, flag off — `.env.example:20`);
Discord and Google OAuth (`.env.example:10,12`, both false); magic link sign-in
(built, then disabled in `aa36aa0` behind `MAGIC_LINK_ENABLED = false` in
`lib/auth-features.ts:19`); `public.set_progress` (a granted RPC with tests in
`tests/db/functions.test.ts:16` and zero callers — `actions/profile.ts:73` says
why); two of the three theme proposals (`docs/design/tokens-terminal.css`,
`tokens-broadsheet.css`, never imported); four analytics events that
`docs/BACKLOG.md` records have never been confirmed to fire in production.

**No reverts in the history.** `git log --grep=revert` is empty. Rework happened
as forward-only rewrites, which is why it is only visible through deletions and
renames.

---

## 3. Slop audit

Searched for each named pattern. Results, including the ones that came back clean:

| Pattern | Result |
| --- | --- |
| Barrel `index.ts` files | **None.** `find lib components actions app -name index.ts` is empty. |
| `utils`/`helpers`/`misc` dumping grounds | **None.** No file by those names exists. |
| Interfaces with one implementation | **None.** No `interface` declarations outside `node_modules`; the codebase uses `type` aliases for data shapes only. |
| `try/catch` that logs and rethrows | **None.** Six `try` blocks total (`lib/supabase/server.ts:26`, `lib/links.ts:22`, `lib/cursor.ts:11`, `lib/auth-callback.ts:32`, `lib/turnstile.ts:47`, `lib/client-ip.ts:13`); none rethrow. |
| Tests asserting a mock was called | 19 occurrences, all on client-side effects (`track`, `router.push`, `navigator.clipboard.writeText`, `fetch`). None on the query layer. Legitimate. |
| Unused dependencies | **None real.** The five that scan as unreferenced (`@types/node`, `@types/react`, `@types/react-dom`, `@testing-library/dom`, `@vitest/coverage-v8`) are implicit by design. |

What the search did find:

**Wrappers that forward arguments unchanged.** Exactly one: `middleware.ts:4`,
`middleware(request)` returning `updateSession(request)`. Required by Next's file
convention. Not slop.

**Exported but used only inside their own file** — 17 symbols. Each is a public
API surface nothing consumes:
`SYNDICATION_LIMIT`, `SyndicatedPost`, `FeedQuery` (`lib/queries/posts.ts`);
`POST_PREFIXES`, `PostPrefix` (`lib/post-url.ts`);
`LINK_MIN_ACCOUNT_AGE_MS`, `LinkPrivilege` (`lib/link-privilege.ts`);
`USERNAME_COOLDOWN_MS` (`lib/profile-rules.ts`);
`RECOVERY_MAX_AGE_SECONDS` (`lib/recovery.ts`);
`ALREADY_REGISTERED`, `AuthErrorLike` (`lib/auth-errors.ts`);
`authOrigin` (`lib/auth-callback.ts`);
`AdminAction`, `AdminTarget` (`lib/admin.ts`);
`SpamRule`, `SpamCheckInput` (`lib/spam.ts`);
`SkeletonLine`, `SkeletonCard` (`components/Skeleton.tsx`).

**Genuinely dead — zero references anywhere:**
- `lib/supabase/client.ts` — the entire file. `createSupabaseBrowserClient` has
  never been called; every client component goes through a server action instead.
- `lib/validation.ts:124-128` — `PostInput`, `ReplyInput`, `GroupInput`,
  `ProfileInput`, `ReportInput`. Five `z.infer` type exports, no consumers.
- `public.set_progress` — see section 2.

**Copy-paste duplication the type system cannot see:**
- `function single(value: string | string[] | undefined)` is byte-identical in
  `app/(app)/feed/page.tsx:12`, `app/(app)/g/[slug]/page.tsx:20`, and
  `app/(app)/topic/[topic]/page.tsx:22`. The 10-line block that follows it
  (parse `tab`, `topic`, `cursor`, `page`, then rebuild `moreParams` and
  `moreHref`) is duplicated across the same three files.
- The PostgREST embed unwrap, `Array.isArray(row.x) ? row.x[0] : row.x`, appears
  8 times across 5 files: `lib/queries/posts.ts:61,62,219,220`,
  `lib/queries/replies.ts:25`, `lib/queries/admin.ts:296`,
  `lib/queries/groups.ts:42`, `app/sitemap.ts:48`.

**Tests that assert how instead of what.** 39 assertions read
`holder.client.calls` to check which builder methods ran, e.g.
`tests/unit/actions.test.ts:415`. `docs/history/DECISIONS.md` states the opposite
as policy: "every test asserts on what the function returned rather than on which
methods were called." The policy is right and it was not enforced.

**Defensive checks for impossible states.** Nothing found that is provably
impossible. 49 `?? []` / `?? 0` / `if (!x) return null` guards in `lib/`, all on
PostgREST results that genuinely can be null.

---

## 4. Recurring issue patterns

Issues that happened more than once, with what would have stopped the second one.

**1. `NEXT_PUBLIC_*` inlined at build time, treated as runtime config.** Hit three
times: `NEXT_PUBLIC_SITE_URL` producing localhost magic links (`919bad5`),
`NEXT_PUBLIC_INDEXING` (`835fe4b`), and `NEXT_PUBLIC_TURNSTILE_*`. Two of the
three now carry a "**and redeploy**" warning in `docs/BACKLOG.md` because setting
them silently does nothing.
*Rule:* a build-time variable is never the only source for a value that can be
derived at request time. `lib/auth-callback.ts` is the pattern: request origin
first, env var as fallback.

**2. Configuration that lives in a provider dashboard, not in the repo.** The
Supabase redirect allow list caused `919bad5`; custom SMTP needed a specific
dashboard interaction that the management API could not reproduce (`59d2469`,
written up at `docs/system/runbook.md:213`). Both cost hours of code-side
debugging for a non-code cause.
*Rule:* keep a written list of every setting that lives outside the repo, and
check it first when behavior contradicts the code. `docs/system/infrastructure.md`
is that list; it should be step 1 of any "the code looks right" investigation.

**3. Business constants duplicated between TypeScript and SQL.** Six pairs, none
of them checked against each other: topics (`lib/topics.ts:1` vs
`supabase/migrations/0003_posts_replies.sql:7`), spoiler range 0–7
(`lib/spoilers.ts:9` vs `0001:8`, `0003:11`, `0003:33`, `0005:39`), bio length 200
(`lib/profile-rules.ts:17` vs `0013:17`), username cooldown 30 days
(`lib/profile-rules.ts:14` vs `0013:49`), title 8–140 (`lib/validation.ts:10` vs
`0003:9`), report reasons (`components/form/ReportDialog.tsx:8` vs `0004:53`).
`supabase/migrations/0010_spoiler_in_title_reason.sql` is an 8-line migration
whose entire purpose is adding one string to a check constraint.
*Rule:* an enumerable business list is a table, not a check constraint plus a TS
array. See section 5.

**4. Redaction that only covered the shape in front of it.** The spoiler leak
(`fc23a84`) and the near-miss this session: `listRepliesByAuthor` still refuses to
embed the parent post, and `app/(app)/u/[username]/page.tsx:94` carries a comment
explaining why the link goes through the legacy uuid path instead.
*Rule:* redaction is recursive by default, and the reason a query does *not*
embed something belongs in a comment at the query, not in a doc.

**5. Framework file conventions changing behavior invisibly.** `loading.tsx`
destroying the 404 (`28c8f2f`), and `opengraph-image.tsx` being served from a
hashed URL so the hand-written `openGraph.images` path 404'd — shipped in the
original post route and only found in `c579e91`.
*Rule:* never hand-write a URL the framework generates. Never add a file
convention to a route without re-running the test that asserts its status code.

**6. `"use server"` modules may only export async functions.** Broke `next build`
twice, both times passing `tsc` first: the `authCallbackUrl` re-export
(`docs/history/DECISIONS.md:49`) and `PASSWORD_RESET_PATH`, which is why
`lib/recovery.ts:24` carries the comment.
*Rule:* constants never live in an actions file, and `pnpm check` is not
sufficient — a production build has to run before a push.

**7. Rate-limit triggers blocking their own tests.** The post rate limit
(`0003:137`, 5/minute) forced `tests/db/post-urls.test.ts:26` to backdate
`created_at` after every insert to write more than five rows.
*Rule:* a limit that a fixture has to defeat should read its threshold from
config, so a test can raise it instead of working around it.

**8. Docs drifting from the code they describe.** `docs/README.md` describes the
design directions as "none of them live" while `docs/design/README.md:3` opens
with "Vice is the live theme" (`2a166a2`). `docs/history/DECISIONS.md:11` says
admin re-checks `ADMIN_USER_IDS` and that an admin flag on `profiles` was
*rejected* — migration `0012` added exactly that flag.
*Rule:* an index that summarizes another doc will go stale. Link, do not
summarize. And a decision log needs an amendment when a decision is reversed.

**9. Deterministic ids meeting data that already exists.** `cc03d50`, plus the
same class in the trigger written to fix it: `generate_post_short_id` in `0014`
had to be `security definer`, or its uniqueness check would read past RLS and
hand out an id the unique index then refuses.
*Rule:* any "generate until unique" loop must see the whole table.

---

## 5. Hardcoding audit

Everything below is a business value baked into code or a check constraint. The
next project requires all of this to be DB-driven and admin-editable.

**Enumerable lists that should be tables:**

| Value | Where it is hardcoded | Also hardcoded in |
| --- | --- | --- |
| Topics (7) | `lib/topics.ts:1` (`TOPICS`), labels at `:5` | `supabase/migrations/0003_posts_replies.sql:7` check constraint |
| Post kinds (2) | `lib/topics.ts:19` (`POST_KINDS`), prefixes at `lib/post-url.ts:12` | `0003:8` check constraint |
| Spoiler levels (8, with label + description each) | `lib/spoilers.ts:23` (`SPOILER_LEVELS`) | `0001:8`, `0003:11`, `0003:33`, `0005:39` |
| Report reasons (6) | `components/form/ReportDialog.tsx:8` | `0004:53`, amended by all of `0010` |
| Feed tabs (3) | `components/shell/FeedTabs.tsx:3` | — |
| Nav items | `components/shell/NavRail.tsx:11`, `components/shell/BottomBar.tsx:3`, `app/(app)/admin/layout.tsx:8` | — |
| Blocked domains / phrases | **Correctly a table** — `0013:70,77`, admin-editable | — |

`docs/BACKLOG.md` already flags the cost: renaming the spoiler labels is "a one
line edit each; the count is a migration and a backfill."

**Numeric limits:**

| Limit | Value | Where |
| --- | --- | --- |
| Posts per author per minute | 5 | `0003:137` |
| Replies per author per minute | 15 | `0003:157` |
| Reporters before auto-hide | 5 | `0004:75` |
| Signups per IP | 5 | `0012:248` |
| Link privilege: account age | 24h | `lib/link-privilege.ts:15` |
| Link privilege: upvotes | 3 | `lib/link-privilege.ts:16` |
| Username change cooldown | 30 days | `lib/profile-rules.ts:14` **and** `0013:49` |
| Bio max length | 200 | `lib/profile-rules.ts:17` **and** `0013:17` |
| Title length | 8–140 | `lib/validation.ts:10` **and** `0003:9` |
| Body length | 1–10,000 | `lib/validation.ts` **and** `0003:10`, `0003:32` |
| Feed page size | 20 | `lib/queries/posts.ts:8` |
| RSS item cap | 50 | `lib/queries/posts.ts:189` |
| Sitemap post cap | 2,000 | `app/sitemap.ts:9` |
| Recovery session lifetime | 15 min | `lib/recovery.ts:29` |
| Anonymous cookie lifetime | 1 year | `lib/anonymous-progress.ts:7` |

`docs/BACKLOG.md` explicitly parks "Review rate limits for a launch spike" —
five values that need tuning on the busiest day of the project's life, each
requiring a migration and a deploy.

**Feature flags as module constants, not data:**
`MAGIC_LINK_ENABLED = false` (`lib/auth-features.ts:19`),
`PASSWORD_RESET_ENABLED = true` (`:30`),
`SPOILER_SHIELD_DEFAULT = false` (`lib/spoilers.ts:12`).
Three env-var flags need a rebuild to change: `NEXT_PUBLIC_INDEXING`,
`NEXT_PUBLIC_TURNSTILE_ENABLED`, `NEXT_PUBLIC_AUTH_*_ENABLED`. `docs/BACKLOG.md`
has an item for flipping `SPOILER_SHIELD_DEFAULT` during launch week — a
one-character change that requires a deploy at the worst possible moment.

**Copy in code:** every user-facing auth string in `lib/auth-errors.ts`
(`GENERIC_AUTH_ERROR:16`, `ALREADY_REGISTERED:20`, `MAGIC_LINK_DISABLED:54`,
`REDIRECT_NOT_ALLOWED:59`), `LINK_PRIVILEGE_ERROR` (`lib/link-privilege.ts:18`),
`REFUSED` (`actions/admin.ts:18`), all validation messages in `lib/validation.ts`,
every empty-state title and body passed to `components/Empty.tsx` from the feed,
group, and topic pages, all 16 spoiler level labels and descriptions, and the
topic hub blurbs at `lib/topic-page.ts:16`.

**Correctly not hardcoded:** colors (all in `lib/theme/tokens.css`, enforced by
lint) and the spam blocklists. Two out of roughly twenty categories.

---

## 6. Docs verdict

Measured by commits touching each file after it was created.

**Earned their keep:**

| Doc | Commits | Why |
| --- | --- | --- |
| `docs/BACKLOG.md` | 9 | Updated in almost every feature commit; the "Recently done" section prevented re-litigating settled decisions. |
| `docs/system/architecture.md` | 9 | Updated as recently as `c579e91`. The only doc a new session actually needed to read before editing. |
| `docs/system/runbook.md` | 6 | Earned it in one incident: `docs/system/runbook.md:127-326` is the auth-email debugging path, written down because it took hours to find twice. |
| `docs/history/DECISIONS.md` | 10 | Answered "why is it like this" repeatedly — until it was frozen. See below. |
| `README.md` | 15 | Highest-churn doc in the repo, and mostly redundant with `docs/`. Churn here is a symptom, not a virtue. |

**Write-only, never touched again after creation:**

| Doc | Commits | Note |
| --- | --- | --- |
| `docs/history/NIGHT_2.md` | 1 | A session diary. Nothing has read it. |
| `docs/history/BUILD_PROMPT.md` | 2 | Create + the move in `c1e6d92`. |
| `docs/history/REVIEW_PROMPT.md` | 2 | Same. |
| `docs/history/STATUS.md` | 3 | Point-in-time; stale on arrival. |
| `docs/history/DEPLOY.md` | 3 | Superseded by the runbook, kept anyway. |
| `docs/history/BUILD_REPORT.md` | 4 | Superseded. |
| `docs/app/seed-personas.md` | 2 | Content, not documentation. |

**The specific failure: `c1e6d92` "Reorganize docs into a handbook" killed the
best doc.** Moving `DECISIONS.md` into `docs/history/` under a banner reading
"Historical record, not maintained" stopped it being updated — it has not been
touched since — and it is now wrong (`:11` says an admin flag on `profiles` was
rejected; `0012` added it). `docs/README.md` still calls it "The most useful of
these." A doc that is still the best answer to "why" should not be filed under
history.

**The minimum set this project actually needed:** four files.
`docs/system/architecture.md` (how it works), `docs/system/runbook.md` (how to
operate and debug it), `docs/system/infrastructure.md` (what lives outside the
repo), and `docs/BACKLOG.md` with decisions folded in as a living "why" section.
Everything in `docs/history/` (7 files, ~1,000 lines) could have been one
`git log`. `README.md` should have been ten lines pointing at `docs/`.

---

## 7. Skills and config audit

**There is no `.claude/` directory.** No skills, no commands, no agents, no
settings. `find . -name .claude` returns nothing.

**There is no committed agent instruction file either.** `CLAUDE.md` at the repo
root is 11 bytes — `@AGENTS.md` — and `AGENTS.md` contains only Next.js's own
auto-generated `nextjs-agent-rules` block. Both are gitignored by `65d5098`
("Next 16 writes AGENTS.md and CLAUDE.md into the repository root the first time
the dev server runs"), and `git ls-files` confirms neither is tracked.

The consequence is measurable. Every convention this project enforces — noindex
by default, no color outside `lib/theme/tokens.css`, no database read outside
`lib/queries/`, `pnpm check` before every push, constants never in a `"use server"`
file, one migration per session — lives only in `docs/`, and had to be
rediscovered by reading them at the start of each session. The two `"use server"`
build failures in section 4 are the direct cost: a rule that was already written
down in `docs/history/DECISIONS.md:49` was violated again because nothing put it
in front of the model.

**Verdict: nothing to KEEP, CUT, or MERGE, because nothing exists.** The finding
is the absence. The rules in section 8 are what `CLAUDE.md` should have contained
from commit one.

---

## 8. Rules for next time

Ranked by the cost of the failure each prevents. Paste into `CLAUDE.md`.

1. **Commit a real `CLAUDE.md` in the first commit and add a rule to it every
   time a convention is discovered.** If the framework generates its own
   `AGENTS.md`, import it; do not let it be the only one.
   *(§7: the two `"use server"` build failures repeated a rule already written in
   `docs/history/DECISIONS.md:49`.)*

2. **Every business list, limit, threshold, and user-facing string is a database
   row, not a constant or a check constraint.** Ship the admin editor for it in
   the same commit as the feature that reads it.
   *(§5: 15 numeric limits and 6 enumerable lists hardcoded, most duplicated
   between TypeScript and SQL; `supabase/migrations/0010` is an entire migration
   to add one string to an enum.)*

3. **A value must have exactly one home. If it must exist in both TypeScript and
   SQL, a test asserts they match.**
   *(§4.3: six TS/SQL constant pairs, none checked — topics, spoiler range, bio
   length, cooldown, title length, report reasons.)*

4. **Redaction, gating, and sanitization walk the entire object graph, and their
   tests assert on the serialized payload.**
   *(§2: `fc23a84` shipped a late-game post title inside a sealed reply for weeks
   because nothing rendered it.)*

5. **Never trust a build-time environment variable as the only source of a value
   derivable at request time.**
   *(§4.1: `NEXT_PUBLIC_SITE_URL` mailed production users links to localhost;
   `NEXT_PUBLIC_INDEXING` and the Turnstile keys each need a redeploy to take
   effect.)*

6. **When behavior contradicts the code, check provider dashboard settings before
   auditing code. Keep the list of out-of-repo settings in one file.**
   *(§4.2: the Supabase redirect allow list and the custom SMTP form each cost
   hours; `docs/system/runbook.md:213` is the write-up.)*

7. **Run a production build before every push, not just typecheck and tests.**
   *(§4.6: `"use server"` export restrictions broke `next build` twice while
   `tsc --noEmit` passed both times.)*

8. **Every route that can 404 has a test asserting the status code. Adding a
   framework file convention to a route re-runs it.**
   *(§2: `loading.tsx` silently turned every missing post into a 200 for
   crawlers; only Playwright caught it.)*

9. **Never hand-write a URL the framework generates.**
   *(§4.5: the `openGraph.images` path was built by hand and 404'd because Next
   serves `opengraph-image` from a hashed route; it shipped and survived until
   `c579e91`.)*

10. **No exported function without a caller in the same commit, and no symbol
    exported that is only used inside its own file.**
    *(§3: `lib/supabase/client.ts` is entirely dead, five `z.infer` types in
    `lib/validation.ts:124-128` have no consumers, 17 symbols are exported for
    nobody; `0018535` deleted a whole reply-editing path built out of symmetry.)*

11. **Enforce architecture with a lint rule when the rule is mechanical.**
    *(§1: `eslint-local/no-raw-color.mjs` is why a rebrand is one file; nothing
    comparable exists for "no database read outside `lib/queries/`", which is
    equally mechanical and equally load-bearing.)*

12. **Write a source-scanning test for every "there must be exactly one way to do
    X" rule.**
    *(§1: `tests/unit/auth-redirect.test.ts` and `tests/unit/request-cache.test.ts`
    catch the second code path, which is the regression that actually happens.)*

13. **Content is data from the first commit. Code reads it; code never contains
    it.**
    *(§2: 583 lines of seed code in `supabase/seed/{seed,content,avatars}.ts` were
    deleted two days after being written, when the content arrived as a file.)*

14. **When a table has a natural unique key, that key is the import identity.
    Look it up, adopt what exists, mint an id only for a key never seen before.
    Any generate-until-unique loop must see past row-level security.**
    *(§2 and §4.9: `cc03d50`; and `generate_post_short_id` needed `security
    definer` for the same class of reason.)*

15. **Decisions live in one maintained file, amended when reversed, never filed
    under "history". An index links to docs; it never summarizes them.**
    *(§6: `c1e6d92` froze `DECISIONS.md` by moving it, and it is now wrong about
    `ADMIN_USER_IDS`; `docs/README.md` still says the design directions are "none
    of them live" while `docs/design/README.md:3` says Vice shipped.)*

16. **A limit a test fixture has to defeat is a limit that belongs in config.**
    *(§4.7: `tests/db/post-urls.test.ts:26` backdates `created_at` on every insert
    to get past the 5-posts-per-minute trigger in `0003:137`.)*
