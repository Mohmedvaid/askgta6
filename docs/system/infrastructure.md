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

`supabase link` needs a personal access token, from **Account, Access Tokens** in the Supabase dashboard. `supabase login` stores it. Those are not the project API keys above; see [Personal access tokens](#personal-access-tokens). Full procedure, including the no token route, is in [runbook.md](runbook.md).

### Auth email

**Resend, over custom SMTP.** Wired up September 3, 2026. The Supabase built in sender is no longer in the path.

- Resend team: the existing one in Mohmed's Resend account. No new team or workspace was created.
- Sending domain `askgta6.com`, verified in Resend with DKIM. The two CNAME records Resend issued, and a DMARC record, are set at Namecheap alongside the Vercel records. See [Domain and DNS](#domain-and-dns).
- Supabase **Authentication, Emails, SMTP Settings**, custom SMTP enabled:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465`. Port `587` also works and is what the other project on this account uses. |
| Username | `resend` |
| Password | a Resend API key. Kept in Mohmed's password manager, never in the repository. |
| Sender email | `noreply@askgta6.com` |

The username is the literal string `resend` for every Resend account. It is not an email address and not the API key. The API key goes in the password field.

**"Confirm email" is on.** That is safe now that the sender is Resend rather than the built in one.

### Email templates, still on the default

**Authentication, Emails, Templates.** Every template is Supabase's stock wording, which says "Supabase" nowhere but reads like a system notice rather than like this site. Worth customizing, not urgent.

The one that matters most is **Reset Password**, because password reset is now the only self service way back into an account while magic link is off, so it is the email a locked out reader actually has to trust and act on.

| Template | Default subject | Change it to something like |
| --- | --- | --- |
| Reset Password | Reset Your Password | Reset your AskGTA6 password |
| Confirm signup | Confirm Your Signup | Confirm your email for AskGTA6 |
| Magic Link | Your Magic Link | Leave it. That method is disabled, see [architecture.md](architecture.md). |

For the reset body, keep four things: who it is from, that somebody asked for it, that ignoring it is safe and changes nothing, and how long the link lasts. `{{ .ConfirmationURL }}` is the link. Say the address plainly next to the button as well, because a mail client that strips the button leaves nothing to click.

The link lands on `/auth/callback?next=/auth/reset`, so the origin has to be in the redirect allow list above like every other auth link. Editing a template does not change any of that.

### Auth URLs

**Authentication, URL Configuration**, set September 3, 2026:

- Site URL: `https://askgta6.com`
- Redirect URLs, all three:
  - `https://askgta6.com/auth/callback`
  - `https://www.askgta6.com/auth/callback`
  - `http://localhost:3000/auth/callback`

The www entry is there even though www redirects to the apex, because a link clicked from an email that hits www should not be rejected before the redirect can happen. The localhost entry is for local development and stays.

This list is the real gate on where an auth link may point. When Supabase receives a `redirect_to` that is not on it, it does not error: it silently substitutes the Site URL, which is a bare origin with no path. That failure mode and how to spot it are in [runbook.md](runbook.md).

### Personal access tokens

Separate from the project API keys above, and easy to confuse with them.

- Created at https://supabase.com/dashboard/account/tokens, under **Account, Access Tokens**.
- They authenticate a person against the **management API** (`api.supabase.com`) and the Supabase CLI, across every project that person can see. Project API keys authenticate an app against one project's data.
- A management API call sends one as `Authorization: Bearer <token>`. The runbook uses this to read and write Auth config when the dashboard is not cooperating.
- Anything created during go live is on the rotation list in [BACKLOG.md](../BACKLOG.md).

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
| `NEXT_PUBLIC_SITE_URL` | config | build time | `https://askgta6.com`, the apex, no trailing slash. The canonical origin for the sitemap, RSS, and Open Graph. Auth redirects prefer the live request origin over this and only fall back to it, so a stale value here no longer breaks magic links, but it still has to match the Supabase redirect allow list. |
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

Live since September 3, 2026.

- Domain: **askgta6.com**
- Registrar: **Namecheap**. DNS is managed at Namecheap under **Domain List, Manage, Advanced DNS**, with the nameservers left on **BasicDNS**. Namecheap is the only place records are edited; nothing is delegated to Vercel or Resend.
- Both hostnames are added to the Vercel project (team mohmeds, project askgta6).

### Records at Namecheap

| Host | Type | Points to | What it does |
| --- | --- | --- | --- |
| `@` | A | the Vercel apex address | Serves the apex, `askgta6.com` |
| `www` | CNAME | the Vercel CNAME target | Serves `www.askgta6.com` |
| two Resend hosts | CNAME | the targets Resend issued | DKIM signing for outbound auth email |
| the DMARC host | TXT | the DMARC policy record | Tells receivers what to do with mail that fails alignment |

Vercel gives the exact A and CNAME targets on the project's **Domains** screen, and Resend gives its two CNAMEs on the domain's page. Copy them from there rather than from memory; the values change.

### Which hostname is canonical

**The apex is primary.** `www.askgta6.com` is configured in Vercel to redirect to `https://askgta6.com` with a **308**, so the www hostname works, keeps its method and body through the redirect, and never serves content of its own. Everything canonical, `NEXT_PUBLIC_SITE_URL`, the sitemap, RSS, and JSON-LD, uses the apex.

## Analytics

Vercel Analytics, mounted in the root layout. Exactly four events, declared in `lib/analytics.ts` with typed properties. No payload carries a user id, a post title, or a body.

| Event | Fires when | Properties |
| --- | --- | --- |
| `signup_completed` | Onboarding finishes | `method` |
| `progress_set` | The shield is toggled or a chapter picked | `level`, `shield`, `source` |
| `post_created` | A post is submitted | `kind`, `topic`, `spoiler_level`, `in_group` |
| `reveal_clicked` | A reader asks to see a sealed body | `target`, `spoiler_level` |

Dashboard: the Analytics tab on the Vercel project.
