# Deploy AskGTA6

Five steps, about ten minutes. Follow them in order. Nothing here assumes you wrote the code.

You need: a Supabase account, a Vercel account, Node 22 or newer, and pnpm 10 or newer.

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and click **New project**.
2. Name it, pick a region near your users, and set a database password. Save that password somewhere.
3. Wait for provisioning to finish (about two minutes).
4. Open **Project Settings**, then **API keys**, and copy these three values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key
   - **service_role** key (this one is secret, never put it in a `NEXT_PUBLIC_` variable)
5. Open **Project Settings**, then **General**, and copy the **Reference ID**. You need it in step 3.

## 2. Put the keys in `.env.local`

From the repository root:

```bash
cp .env.example .env.local
```

Fill it in:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_DISCORD_ENABLED=false
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false
ADMIN_USER_IDS=
```

Leave `ADMIN_USER_IDS` empty for now. Step 6 fills it in.

## 3. Push the migrations

Install the Supabase CLI if you do not have it (https://supabase.com/docs/guides/local-development/cli/getting-started), then:

```bash
supabase login
supabase link --project-ref <Reference ID from step 1>
pnpm supabase:push
```

`pnpm supabase:push` wraps `supabase db push`. It applies every file in `supabase/migrations/` in order and will ask you to confirm the list. Say yes.

This creates the tables, triggers, functions, row level security policies, and the `avatars` storage bucket. Nothing else needs to be created by hand.

To confirm it worked, open **Table Editor** in the dashboard. You should see `profiles`, `groups`, `group_members`, `group_invites`, `posts`, `replies`, `votes`, and `reports`, each with the RLS badge turned on.

## 4. Seed the content

```bash
pnpm seed
```

This creates four seed accounts, two public groups, one private group, about 180 posts, about 450 replies, votes, and accepted answers. It is idempotent: running it twice does not duplicate anything.

It prints the private group's invite code, something like `Night shift invite code: NIGHTRUN`. Save it if you want to test the invite flow.

The seed accounts all use the password `askgta6-seed-account`. Delete them before you have real users, or change the password in `supabase/seed/seed.ts` first.

Check it locally now:

```bash
pnpm dev
```

Open http://localhost:3000. You should see the landing page, and http://localhost:3000/feed should show posts.

## 5. Configure Supabase Auth

In the Supabase dashboard, open **Authentication**, then **URL Configuration**:

- **Site URL**: `https://your-domain.com` (use `http://localhost:3000` until you have deployed)
- **Redirect URLs**: add all of these, one per line:
  - `http://localhost:3000/auth/callback`
  - `https://your-domain.com/auth/callback`
  - `https://your-project.vercel.app/auth/callback`

Then open **Authentication**, then **Sign In / Providers**, and under **Email**:

- Leave **Confirm email** on for production. With it on, a new account has to click the link in the confirmation email before it can post.
- Turn it off if you want sign up to work instantly while you are testing.

Magic links work with no extra configuration. Discord and Google are wired but off: to turn one on, add the provider credentials under **Sign In / Providers**, then set `NEXT_PUBLIC_AUTH_DISCORD_ENABLED=true` or `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`. The buttons only render when the flag is true.

## 6. Deploy to Vercel

1. Push this repository to GitHub.
2. At https://vercel.com/new, import it. Vercel detects Next.js on its own, so leave the build settings alone.
3. Before clicking Deploy, add the environment variables. They are the same names as `.env.local`, with two changes:
   - `NEXT_PUBLIC_SITE_URL` is your deployed origin, for example `https://askgta6.com` or `https://askgta6.vercel.app`. No trailing slash.
   - `SUPABASE_SERVICE_ROLE_KEY` should be added to Production and Preview only, not Development.
4. Deploy.
5. Go back to Supabase and make sure the deployed origin is in **Site URL** and **Redirect URLs** from step 5.
6. To give yourself the moderation queue: sign up on the deployed site, then in Supabase open **Authentication**, then **Users**, copy your user's UID, and set `ADMIN_USER_IDS` in Vercel to that UID. Multiple admins are comma separated with no spaces. Redeploy for the change to take effect. `/admin/reports` returns a 404 for everyone not in that list.

## Verify the deploy

- `/` shows the landing page and the slider demo hides and reveals the sample cards.
- `/feed` shows seeded posts, and the level 1 to 3 seed posts render as sealed placeholders while you are signed out.
- Sign up, pick a username in onboarding, then raise your progress in the right hand panel. The sealed posts open.
- Post something. Reply to it. Vote on it. Mark a reply as the answer.
- Open a post's link in a Slack or Discord message and confirm the preview image is generic for anything above level 0.

## Storage note

The `avatars` bucket is created by `supabase/migrations/0007_storage.sql`. If your Supabase project refuses that migration because of storage permissions, create the bucket by hand instead:

1. **Storage**, then **New bucket**, name it `avatars`, mark it **Public**.
2. Set the file size limit to 2 MB and the allowed MIME types to `image/png,image/jpeg,image/webp,image/gif`.
3. Under the bucket's **Policies**, add: public `SELECT` for everyone, and `INSERT`, `UPDATE`, `DELETE` for `authenticated` where the first folder of the object name equals the user's id.

## Environment variables, in one place

| Name | Where | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client and server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client and server | Supabase anon key, safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Service role key, used by the seed script and admin actions only |
| `NEXT_PUBLIC_SITE_URL` | client and server | Public origin, used for auth redirects and Open Graph URLs |
| `NEXT_PUBLIC_AUTH_DISCORD_ENABLED` | client | `true` renders the Discord button |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | client | `true` renders the Google button |
| `ADMIN_USER_IDS` | server only | Comma separated auth user uuids that can open `/admin/reports` |
