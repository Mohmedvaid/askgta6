# Runbook

Operating procedures. Every one assumes a machine with Node 22 or newer and pnpm 10 or newer.

## Run it locally from scratch

```bash
git clone https://github.com/Mohmedvaid/askgta6.git
cd askgta6
pnpm install
cp .env.example .env.local
```

Fill in `.env.local` from **Project Settings, API Keys** in the Supabase dashboard (https://supabase.com/dashboard/project/hxljpyqwhdhxkcasmgut/settings/api-keys):

- `NEXT_PUBLIC_SUPABASE_URL` is `https://hxljpyqwhdhxkcasmgut.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the publishable key
- `SUPABASE_SERVICE_ROLE_KEY` is the secret key
- `NEXT_PUBLIC_SITE_URL` is `http://localhost:3000`
- `NEXT_PUBLIC_INDEXING` is `off`

Then:

```bash
pnpm dev
```

http://localhost:3000. The migrations are already applied to the shared project, so there is nothing to push and the feed has content.

`http://localhost:3000/auth/callback` has to be in the Supabase redirect allow list or magic links and confirmation emails will bounce locally. Check **Authentication, URL Configuration**.

To work fully offline, run `pnpm test:db`. That suite boots Postgres in WebAssembly and needs no network.

## Add a migration safely

1. Write it as the next number in `supabase/migrations/`, for example `0012_whatever.sql`. Never edit an applied migration; the tooling tracks them by filename.
2. Make it additive where you can. A new column with a default and `if not exists` can be applied while the old code is still live.
3. Run `pnpm test:db`. That harness applies every migration in order on a fresh Postgres, so a migration that cannot apply cleanly on top of the others fails here.
4. Apply it to the project **before** pushing code that depends on it:

```bash
supabase login          # if the CLI is not already logged in
supabase link --project-ref hxljpyqwhdhxkcasmgut
pnpm supabase:push
```

Without an access token, connect directly instead. The password is in Mohmed's password manager:

```bash
pnpm exec supabase db push \
  --db-url "postgresql://postgres:<db password>@db.hxljpyqwhdhxkcasmgut.supabase.co:5432/postgres"
```

5. Then push `main`, which deploys.

**The order matters.** Vercel deploys on push, so pushing code that reads a column the database does not have takes production down for signed in readers the moment it lands. A Claude Code session that adds a migration is under standing instruction to commit and stop rather than push.

## Seed, and where the credentials land

```bash
pnpm seed:import
```

Imports `supabase/seed/seed.json`: 36 accounts, 420 posts, 2100 replies, accepted answers, and real vote rows. Idempotent, so running it twice updates rather than duplicating, and resumable with `--from=<phase>` if it fails partway. Full procedure, including how to append content later, is in [../app/seed-content.md](../app/seed-content.md).

Every account gets a **fresh random password per run**, written to `seed-credentials.local.json` in the repository root, mode 600, gitignored. Re-running rotates them, so an old copy stops working. The file never enters git.

Seed content is drawn only from Trailer 1, Trailer 2, and the store listings. It fabricates no story details.

## Make someone an admin

Admin is `profiles.is_admin`, a column. There is no environment variable and no
dashboard control for it, on purpose: granting admin is rare and should leave a
trace in SQL rather than in a form nobody remembers using.

Migration `0012` sets it for `mohmedvaid@gmail.com` and is idempotent, so a fresh
project or a re-run does the right thing. For anyone else, run this in the Supabase
SQL editor and record who and when in a commit message:

```sql
update public.profiles
set is_admin = true
where id in (select id from auth.users where lower(email) = lower('<their email>'));
```

To take it away, the same with `false`. An admin cannot be banned or deleted from
the dashboard until the flag comes off, which is deliberate: the alternative is one
compromised admin session removing everyone else.

Confirm it landed:

```sql
select p.username, p.is_admin, p.banned_at
from public.profiles p
join auth.users u on u.id = p.id
where p.is_admin;
```

## Rotate every secret

Do these in order. Each one takes effect somewhere different.

**Supabase publishable and secret keys.** Dashboard, **Project Settings, API Keys**, roll the key. Then update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production scope) and in every local `.env.local`. **Redeploy**, because the publishable key is baked in at build time. The secret key is read at runtime and takes effect on the next request, but redeploy anyway so the two never drift.

**Database password.** Dashboard, **Project Settings, Database**, reset it. Store the new one in the password manager. Nothing in Vercel or the app uses it, so no redeploy is needed. Anyone with the old connection string loses access.

**Supabase personal access tokens.** Dashboard, **Account, Access Tokens**, https://supabase.com/dashboard/account/tokens. Revoke anything you do not recognise, in particular any token created for a Claude Code cloud session and the one created for the management API during go live. Revoking one breaks `supabase link` on machines using it; run `supabase login` again with a fresh token.

**Resend API key.** Resend dashboard, **API Keys**. Create the replacement first, write it into Supabase **Authentication, Emails, SMTP Settings** or through the management API PATCH below, wait for "Reloading api with new configuration" in the Auth logs, send yourself a magic link to confirm, and only then delete the old key. Doing it the other way round takes auth email down between the two steps.

**Vercel tokens.** Vercel account settings, **Tokens**. Revoke and reissue.

**Seed account passwords.** Run `pnpm seed:import` again, which rotates every one of them, or delete the accounts outright in **Authentication, Users**.

**Anything that touched a Claude Code cloud environment.** Treat as exposed and rotate. That item is on the backlog with a deadline.

## Read production logs

**Vercel runtime logs** are where application errors surface, including every auth failure. Vercel dashboard, team mohmeds, project askgta6, **Logs** tab. Filter on `[auth]` to see auth failures; each line carries the Supabase code, status, and message, and never an email or token. Filter by status code for 500s.

**Supabase auth logs** are where the other half of an auth problem lives: rejected redirects, rate limits, and email send failures that never reach the app. Dashboard, **Logs, Auth Logs**: https://supabase.com/dashboard/project/hxljpyqwhdhxkcasmgut/logs/auth-logs

**Supabase Postgres logs** for query errors and row level security denials: **Logs, Postgres Logs**.

When a reader reports "it just says it did not work", check the Vercel log first for the mapped code, then the Supabase auth log for what the API actually returned.

## Auth email and redirect troubleshooting

The procedure that got auth email working on September 3, 2026. Every secret below
is a placeholder. Never paste a real key into this file or into a shell history you
keep.

### The order to check things in

Work down the list. Each step rules out a layer, and the layers are easy to confuse
because all three failure modes present to a person as "the link did not work".

**1. Is the app sending the right redirect?**

Vercel, project askgta6, **Settings, Environment Variables**. `NEXT_PUBLIC_SITE_URL`
should be `https://askgta6.com`, scoped to Production, no trailing slash. It is
inlined at build time, so **setting it does nothing until you redeploy**, and the
redeploy has to run with "Use existing build cache" unchecked or the old value stays
baked in.

Since the go live fix, `authCallbackUrl()` prefers the origin the request actually
arrived on over this variable, so a stale value is no longer fatal. Check it anyway:
it is still what the sitemap, RSS, and Open Graph URLs use.

**2. Is Supabase accepting that redirect?**

**Authentication, URL Configuration**. Site URL and the Redirect URLs list are in
[infrastructure.md](infrastructure.md). This is the step that actually bit us.

**3. Read the verify link out of a real email.**

Request a magic link, open the email, and copy the URL behind the button without
clicking it. It looks like:

```
https://<project ref>.supabase.co/auth/v1/verify?token=<token>&type=magiclink&redirect_to=<origin>
```

The `redirect_to` parameter is the whole diagnosis:

| What `redirect_to` shows | What it means |
| --- | --- |
| `https://askgta6.com/auth/callback` | Correct. If the link still fails, the problem is downstream, in the callback route or the session exchange. |
| A **bare origin with no path**, for example `http://localhost:3000` | Supabase rejected what the app sent and substituted its own **Site URL**. The app can only ever emit a URL ending in `/auth/callback`, so a missing path means this is Supabase, not the app. Fix step 2. |
| The right path on the wrong host | The app sent that host. Since the request origin now wins, this means the request itself arrived there, so check the domain assignment in Vercel rather than the variable. |

**4. Read the Auth logs.**

**Logs, Auth Logs**: https://supabase.com/dashboard/project/hxljpyqwhdhxkcasmgut/logs/auth-logs

Filter the path to `/otp` for magic link requests and to `/verify` for the click on
the link in the email. Between them they separate "the email was never sent" from
"the email was sent and the link was refused".

Read the `msg` and `error` fields, not just the status. The one to know:

- **`535`**, or any message about authentication failing at the SMTP layer, is
  **SMTP credentials**. Supabase could not log in to Resend. Almost always the
  password field holds something other than a valid Resend API key, or the username
  is not the literal string `resend`.

### Prove an SMTP key works, independent of Supabase

When step 4 says 535, test the key directly. If this succeeds and Supabase still
fails, the key is fine and Supabase is holding a different value.

```bash
# Placeholders. Substitute a real key at the prompt, never in a file.
RESEND_KEY='<resend api key>'

curl --url 'smtps://smtp.resend.com:465' \
  --ssl-reqd \
  --user "resend:$RESEND_KEY" \
  --mail-from 'noreply@askgta6.com' \
  --mail-rcpt '<your inbox>' \
  --upload-file - <<'EOF'
From: AskGTA6 <noreply@askgta6.com>
To: <your inbox>
Subject: SMTP check

Sent straight through smtp.resend.com, bypassing Supabase.
EOF
```

A clean exit and an arriving email means the key, the port, the username, and the
verified sending domain are all correct, and the fault is in what Supabase stored.

### What actually engaged custom SMTP, September 4, 2026

Read this before spending time on any of the steps above. It is the resolution, and
it is not what the layers suggest.

**Custom SMTP only engages when the dashboard form is saved with every field filled
in, in one submit, after toggling custom SMTP off and back on.** A partial save, or
a save that leaves one field for later, leaves the project on the built in sender
while the form looks correct.

The confirmation is a single line in the Auth logs:

```
updating Email limiter from 2/1h to 30
```

Two per hour is the built in sender's rate limit. Thirty is the custom SMTP one. If
that line is not in the log, custom SMTP is not engaged, whatever the form shows and
whatever a GET of the config returns.

Two things this cost us:

- **Management API writes update the stored config but did not engage the service.**
  A PATCH returned 200, a GET read the new values back, and mail kept going out
  through the built in sender at 2 per hour. Use the API to read config and to
  confirm what is stored. Do not trust it to turn this particular thing on.
- **Port 587 works**, and is what the other project on this account uses. Port 465
  is what is written down in [infrastructure.md](infrastructure.md) and it also
  works, but if 465 is behaving strangely, 587 is the known good fallback rather
  than a thing to debug.

### Set Auth config through the management API

The dashboard's SMTP form sometimes appears to save and does not persist. The
management API is the reliable path, and it also lets you read back what is actually
stored rather than what the form is showing you.

You need a **personal access token**, created at
https://supabase.com/dashboard/account/tokens. It is not a project API key. See
[infrastructure.md](infrastructure.md).

```bash
# Placeholders throughout.
SUPABASE_PAT='<personal access token>'
PROJECT_REF='hxljpyqwhdhxkcasmgut'
```

Read the whole Auth config, which is the fastest way to see what is really set:

```bash
curl -s -X GET \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_PAT" | jq '{
    site_url,
    uri_allow_list,
    mailer_autoconfirm,
    external_email_enabled,
    smtp_host,
    smtp_port,
    smtp_user,
    smtp_sender_name,
    smtp_admin_email
  }'
```

`smtp_pass` is never returned, only written, so its absence from the response says
nothing about whether it is set. That is exactly why a wrong password is invisible
in the dashboard and only shows up as a 535 in the Auth logs.

Write the SMTP password, and anything else that will not stick:

```bash
curl -s -X PATCH \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{
    "smtp_host": "smtp.resend.com",
    "smtp_port": 465,
    "smtp_user": "resend",
    "smtp_pass": "<resend api key>",
    "smtp_admin_email": "noreply@askgta6.com",
    "smtp_sender_name": "AskGTA6"
  }'
```

The URL fields go the same way when the dashboard is being unhelpful:

```bash
curl -s -X PATCH \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{
    "site_url": "https://askgta6.com",
    "uri_allow_list": "https://askgta6.com/auth/callback,https://www.askgta6.com/auth/callback,http://localhost:3000/auth/callback"
  }'
```

`uri_allow_list` is one comma separated string, not an array, and it **replaces** the
whole list rather than adding to it. Read the config first and put every entry you
want to keep back in.

### Know when a save actually took effect

A 200 from the PATCH means Supabase accepted the write. It does not mean the running
auth server has picked it up.

Watch the Auth logs for a line reading **"Reloading api with new configuration"**.
That is the auth server restarting with what you just wrote. Until it appears, the
old configuration is still what a signup or a magic link request will use, and
retesting only re-proves the previous state. It usually lands within a few seconds.
If it never appears, the save did not take, whatever the form said.

## Redeploy

Any push to `main` deploys. To redeploy the same commit, for example after changing a `NEXT_PUBLIC_*` variable:

Vercel dashboard, project askgta6, **Deployments**, the current production deployment, the three dot menu, **Redeploy**. Leave "Use existing build cache" unchecked when the change is an environment variable, so the new value is actually baked in.

## Roll back a deploy

Vercel dashboard, project askgta6, **Deployments**. Find the last known good deployment, the three dot menu, **Promote to Production**. It is instant, because the build already exists.

**A rollback does not roll back the database.** If the bad deploy shipped alongside a migration, rolling back the code leaves the schema ahead of it. That is usually fine for an additive migration and broken for a destructive one, which is the reason to keep migrations additive.

After rolling back, `main` still holds the bad commit. Revert it in git so the next push does not redeploy the same problem.

## Back up and restore the database

**Free tier reality:** Supabase takes daily backups on paid plans. On the free tier there are no automatic backups, so a manual dump is the only copy. Take one before anything destructive, and put a real backup plan in place with the Pro upgrade on the backlog.

Manual dump, from a machine with the CLI logged in:

```bash
supabase link --project-ref hxljpyqwhdhxkcasmgut
supabase db dump -f backup-$(date +%Y%m%d).sql --data-only
supabase db dump -f schema-$(date +%Y%m%d).sql
```

The first is the rows, the second the schema. Keep both together; one without the other does not restore.

Restore into a fresh project:

```bash
supabase link --project-ref <new project ref>
pnpm supabase:push                 # rebuild the schema from migrations
psql "<connection string>" -f backup-YYYYMMDD.sql
```

Restoring into the **existing** project is a delete and reload, so take a fresh dump first and expect downtime.

For a point in time restore, that is a paid feature. Dashboard, **Database, Backups**, once the project is on Pro.
