# AskGTA6 MVP: reviewer session (run in a fresh session, not the builder)

> Historical record, not maintained. The current handbook is [docs/README.md](../README.md).

You are reviewing a Next.js plus Supabase MVP that another session built overnight from the spec in `docs/` (read `docs/BUILD_REPORT.md` and `docs/DECISIONS.md` first, then the original build prompt if it is in the repo). You did not write this code. Do not trust the build report; verify it.

Do this, in order, and fix what you find directly on `main` with clear commits. Do not ask questions. No em dashes anywhere.

1. Run `pnpm install`, `pnpm check`. If anything fails, fix it first. Report the coverage numbers you observe, not the ones claimed.

2. Spoiler gate audit. This is the product. Trace every read path that returns posts or replies (feed, post page, search, group feed, profile tabs, OG image route, any RPC). Confirm each one passes through `applySpoilerGate` or equivalent server-side gating and that a hidden item never includes title, body, or body length in the response payload. Write a test for any path that was missing one. Confirm reveals are not persisted and do not change progress.

3. RLS audit. Read every policy in `supabase/migrations/`. For each table, write down who can select, insert, update, delete, and check it against the spec in section 6 of the build prompt. Specifically prove with a pglite test that: a non-member cannot see a private group's posts through select, search, or counts; a client cannot write `vote_count`, `reply_count`, `is_hidden`, or `accepted_reply_id`; a user cannot update another user's profile or post; the service role key is never referenced from any client-reachable code path.

4. Theme audit. Grep `app/`, `components/`, and `actions/` for hex, rgb, hsl, oklch literals and for Tailwind default palette classes. Confirm the lint rule that enforces this exists and fails on a deliberate violation (add one, watch it fail, remove it). Confirm dark and light both render without a flash on first paint.

5. Slop pass. Look for: wrapper functions that forward arguments unchanged, interfaces with one implementation, `utils` or `helpers` grab bags, barrel index files, try/catch that logs and rethrows, defensive checks for impossible states, tests that only assert a mock was called, components with more than 8 props, any page file over 200 lines. Delete or simplify. Every deletion must keep `pnpm check` green.

6. Responsive pass. Build and run. Check the shell at 1440, 1024, 768, and 390 widths. The rail must become a bottom bar on mobile, the right column must collapse, and nothing may overflow horizontally. Fix what breaks.

7. Deploy doc pass. Read `docs/DEPLOY.md` as if you were a human with a fresh Supabase project and a Vercel account and no context. Every step must be exact. Add anything missing (Auth redirect URLs, Storage bucket policy, env var names, seed command).

8. Write `docs/REVIEW_REPORT.md`: what you verified, what you fixed (with commit hashes), what still needs a human, and any disagreement you have with a decision in `docs/DECISIONS.md` with your reasoning in one line each.

Then stop.
