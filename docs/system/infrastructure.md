# Infrastructure

Where everything lives. No secret values appear in this file, only where to find them.

## GitHub

- Repository: `Mohmedvaid/askgta6`, https://github.com/Mohmedvaid/askgta6
- `main` is the only branch and the default branch. There are no others.
- Pushing to `main` triggers a Vercel production deploy. There is no staging environment and no preview branch.
- Consequence worth remembering: a push is a deploy. Nothing sits in a queue waiting for review.

## Supabase

- Project name: askgta6
- Project ref: `hxljpyqwhdhxkcasmgut`
- Organization: Mohmedvaid's Org
- Region: us-east-1
- Plan: free tier
- Dashboard: https://supabase.com/dashboard/project/hxljpyqwhdhxkcasmgut

### Keys

This project uses Supabase's newer **publishable and secret** key format, not the legacy `anon` and `service_role` JWTs. The two behave the same way from the app's point of view: the publishable key is safe in the browser, the secret key is server only.

- Find them at **Project Settings, API Keys**: https://supabase.com/dashboard/project/hxljpyqwhdhxkcasmgut/settings/api-keys
- The environment variable names still say `ANON` and `SERVICE_ROLE` because renaming them would mean touching every deploy target for no behavioural gain. The publishable key goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the secret key in `SUPABASE_SERVICE_ROLE_KEY`.

### Database password

Kept in Mohmed's password manager. It is not in the repository, not in Vercel, and not in any doc. The app never uses it: only the Supabase CLI does, and only when pushing migrations over a direct connection.

### Migrations

- They live in `supabase/migrations/`, numbered and applied in filename order.
- `0001` through `0011` are applied to the live project.
- Applying them needs a machine with the Supabase CLI logged in:

```bash
supabase link --project-ref hxljpyqwhdhxkcasmgut
pnpm supabase:push
```

`supabase link` needs a personal access token, from **Account, Access Tokens** in the Supabase dashboard. `supabase login` stores it. Full procedure, including the no token route, is in [runbook.md](runbook.md).

### Auth email

The Supabase built in sender, which is heavily rate limited and not meant for production volume. Resend SMTP is on the backlog and has to be wired in before launch. Until it is, "Confirm email" being on will bottleneck signups.

## Vercel

- Team: mohmeds
- Project: askgta6
- Production only. No preview deployments configured.
- Every environment variable is scoped to **Production**.

### The build time trap

Anything named `NEXT_PUBLIC_*` is **inlined into the bundle at build time**, not read at runtime. Changing one of those in the Vercel dashboard does nothing until you redeploy. Server only variables are read at runtime and take effect on the next request.

### Every environment variable

| Name | Type | Read where | What it is for |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | config | build time | The project URL, `https://hxljpyqwhdhxkcasmgut.supabase.co`. Also used by `next.config.ts` to build the Content Security Policy. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | secret, but safe to expose | build time | The Supabase publishable key. Every browser and server read goes through it, under row level security. |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | runtime, server only | The Supabase secret key. Bypasses row level security. Used by exactly two things: the seed script, and the admin moderation actions after they re-check `ADMIN_USER_IDS`. Never reaches the browser. |
| `NEXT_PUBLIC_SITE_URL` | config | build time | The public origin, no trailing slash. Builds the `emailRedirectTo` for signup and magic links, and the Open Graph base URL. Must match what is in the Supabase redirect allow list. |
| `NEXT_PUBLIC_AUTH_DISCORD_ENABLED` | config | build time | `true` renders the Discord sign in button. Set it only after the provider is configured in Supabase. |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | config | build time | `true` renders the Google sign in button. Same rule. |
| `NEXT_PUBLIC_INDEXING` | config | build time | `off` in production today. `off` disallows every crawler and sends noindex everywhere. `on` opens the landing page, feed, public groups, public profiles, and public posts. |
| `ADMIN_USER_IDS` | config | runtime, server only | Comma separated auth user uuids allowed to open `/admin/reports`. Empty today, so that page 404s for everyone. |

`.env.example` in the repository root carries the same list with a one line comment each.

## Claude Code cloud environment

Sessions run in a container with the Supabase variables already set.

- **Network access must be set to full.** On the default restricted setting the egress proxy refuses every `*.supabase.co` and `api.supabase.com` host with a 403 on CONNECT, and the direct Postgres hostname does not resolve. Symptoms look like a credential problem but are not.
- **Rule: if a session adds a migration, it must not push `main` until that migration is applied to the project.** Vercel deploys from `main` on push, so shipping code that reads a column the database does not have takes production down for signed in readers the moment the push lands. Commit the migration, report it, and stop.
- Secrets placed in this environment should be treated as exposed and rotated before launch. That item is in [BACKLOG.md](../BACKLOG.md).

## Domain and DNS

- Registrar: **TBD**. Fill this in when the domain is bought.
- Nothing points at the Vercel project yet, so production is reachable only on the `vercel.app` hostname.
- When the domain lands: add it in Vercel, point DNS, set `NEXT_PUBLIC_SITE_URL` to it, redeploy, and add the origin to the Supabase auth allow list. All four steps, in that order, or magic links break.

## Analytics

Vercel Analytics, mounted in the root layout. Exactly four events, declared in `lib/analytics.ts` with typed properties. No payload carries a user id, a post title, or a body.

| Event | Fires when | Properties |
| --- | --- | --- |
| `signup_completed` | Onboarding finishes | `method` |
| `progress_set` | The shield is toggled or a chapter picked | `level`, `shield`, `source` |
| `post_created` | A post is submitted | `kind`, `topic`, `spoiler_level`, `in_group` |
| `reveal_clicked` | A reader asks to see a sealed body | `target`, `spoiler_level` |

Dashboard: the Analytics tab on the Vercel project.
