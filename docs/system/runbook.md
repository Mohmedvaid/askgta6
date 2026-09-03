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
pnpm seed
```

Idempotent: four accounts, two public groups, one private group with a printed invite code, roughly 180 posts, 450 replies, votes, and accepted answers. Running it twice does not duplicate anything.

Every account gets a **fresh random password per run**. They are printed once to the console and written to `seed-credentials.local.json` in the repository root, mode 600, gitignored. Re-running rotates them, so an old copy stops working. The file never enters git.

Seed content is drawn only from Trailer 1, Trailer 2, and the store listings. It fabricates no story details.

## Rotate every secret

Do these in order. Each one takes effect somewhere different.

**Supabase publishable and secret keys.** Dashboard, **Project Settings, API Keys**, roll the key. Then update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production scope) and in every local `.env.local`. **Redeploy**, because the publishable key is baked in at build time. The secret key is read at runtime and takes effect on the next request, but redeploy anyway so the two never drift.

**Database password.** Dashboard, **Project Settings, Database**, reset it. Store the new one in the password manager. Nothing in Vercel or the app uses it, so no redeploy is needed. Anyone with the old connection string loses access.

**Supabase personal access tokens.** Dashboard, **Account, Access Tokens**. Revoke anything you do not recognise, in particular any token created for a Claude Code cloud session. Revoking one breaks `supabase link` on machines using it; run `supabase login` again with a fresh token.

**Vercel tokens.** Vercel account settings, **Tokens**. Revoke and reissue.

**Seed account passwords.** Run `pnpm seed` again, which rotates all four, or delete the accounts outright in **Authentication, Users**.

**Anything that touched a Claude Code cloud environment.** Treat as exposed and rotate. That item is on the backlog with a deadline.

## Read production logs

**Vercel runtime logs** are where application errors surface, including every auth failure. Vercel dashboard, team mohmeds, project askgta6, **Logs** tab. Filter on `[auth]` to see auth failures; each line carries the Supabase code, status, and message, and never an email or token. Filter by status code for 500s.

**Supabase auth logs** are where the other half of an auth problem lives: rejected redirects, rate limits, and email send failures that never reach the app. Dashboard, **Logs, Auth Logs**: https://supabase.com/dashboard/project/hxljpyqwhdhxkcasmgut/logs/auth-logs

**Supabase Postgres logs** for query errors and row level security denials: **Logs, Postgres Logs**.

When a reader reports "it just says it did not work", check the Vercel log first for the mapped code, then the Supabase auth log for what the API actually returned.

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
