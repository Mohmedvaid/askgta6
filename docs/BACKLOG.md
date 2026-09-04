# Backlog

## Before launch

GTA VI releases **November 19, 2026**. Digital pre-load is **November 12**, and traffic starts climbing then, so aim to be finished by pre-load day rather than launch day.

Roughly in the order they unblock each other.

### Rotate every secret placed in a Claude Code cloud environment

Treat them as exposed: the Supabase publishable key, the secret key, and the database password. Follow the rotation order in [system/runbook.md](system/runbook.md). Separately, **revoke the claude-cloud Supabase access token** under **Account, Access Tokens**. Do this before the site is public, not after.

### Rotate the two credentials used during go live

Both were handled outside a password manager on September 3, 2026 while auth email was being debugged, so treat both as exposed.

- **The Resend API key** now sitting in Supabase custom SMTP. Rotate it with the create, swap, verify, delete order in [system/runbook.md](system/runbook.md), not the other way round, or auth email goes down between the two steps.
- **The Supabase personal access token** created for the management API calls, at https://supabase.com/dashboard/account/tokens. It carries account wide access to every project, which is wider than any project API key, so it is the more expensive of the two to leave lying around. Revoke it and issue a fresh one only when something needs it again.

### Delete or lock the seed accounts, decide what seed content stays

The imported seed accounts have rotating random passwords, and there are also several hundred synthetic voter accounts that hold no content. Before launch either delete them in **Authentication, Users** or lock them.

Then decide what happens to 420 seed posts and 2100 replies: a forum with visible seed content on day one looks either lived in or fake, depending on how good it is. Read a sample and choose. [app/seed-content.md](app/seed-content.md) says where it comes from and how to remove it.

### Real brand

The Vice direction is applied, so this is now a swap of one palette for another rather than a swap of a placeholder for a design. [design/README.md](design/README.md) has the contrast table any replacement has to hold. Each piece is swappable from exactly one file:

- Palette, radii, shadows, spacing: `lib/theme/tokens.css`. Nothing else in the codebase declares a color and `pnpm lint` fails if anything tries.
- Open Graph palette: `lib/theme/og.ts`, six hex values. The one deliberate duplicate, because Satori cannot read CSS custom properties. Keep it in step by eye.
- Fonts: `lib/theme/fonts.ts`. Archivo Black, Inter, IBM Plex Mono today.
- Wordmark: `components/brand/Wordmark.tsx`.
- Square mark, used as the avatar fallback: `components/brand/Mark.tsx`.
- Favicon: `app/icon.svg`, a standalone copy of the mark with the colors written out, because a favicon cannot read CSS custom properties. It needs the same swap.

### Discord OAuth, and maybe Google

Register the application, add the credentials in Supabase **Authentication, Sign In / Providers**, then set `NEXT_PUBLIC_AUTH_DISCORD_ENABLED=true` in Vercel and redeploy. The code path is complete; the button only renders when the flag is on. Discord matters more than Google for this audience. Google is optional.

### Flip indexing on and submit the sitemap

When there is real content worth finding, set `NEXT_PUBLIC_INDEXING=on` in Vercel and **redeploy** (build time variable). Confirm `robots.txt` and `/sitemap.xml` look right on the live domain, then submit the sitemap in Google Search Console. Do not flip this while the site is mostly seed content.

### Rename the spoiler level labels

Once the real chapter structure is public, rename them in `SPOILER_LEVELS` in `lib/spoilers.ts`. **The count stays at eight**: the database check constraints assume 0 to 7 and existing posts carry those numbers. Labels are a one line edit each; the count is a migration and a backfill.

### Review rate limits for a launch spike

Today: 5 posts and 15 replies per person per minute, enforced by triggers in migration `0003`. Those are tuned for a quiet forum and may be wrong in both directions during launch week. Decide before November 12.

### Supabase Pro before November 12

Three reasons, in order of how much they hurt:

- **No automatic backups on the free tier.** A manual `supabase db dump` is the only copy that exists, and nobody is going to run one at 2am. Pro takes daily backups.
- **Auth rate limits.** The free tier's hosted auth limits, on emails in particular, are meant for development. A launch week signup spike will hit them, and the failure looks to a person like "it just did not work". The app maps that code to specific copy, so it will at least be legible in the Vercel logs, but the signups are still lost.
- **Connection and bandwidth ceilings**, which are the ones that turn a good day into an outage.

Do this before pre-load day, not before launch day. Traffic starts climbing on November 12.

### Decide SPOILER_SHIELD_DEFAULT for launch week

It is `false` today, which is right pre-launch when almost nothing is a spoiler. The week the game is out, that inverts: the feed fills with real story content and a reader arriving with the shield off gets spoiled by the thing built to prevent it. Decide whether to flip the default in `lib/spoilers.ts` for launch week, and whether to flip it back later. One line, but it changes what a first time visitor sees.

### Moderation plan for launch week

There is a dashboard now, and still no notification when auto hide fires. Decide who checks `/admin`, how often, and what happens at 2am. Leaks will arrive faster than reports around launch.

### Turn Turnstile on

Register the site at Cloudflare, put the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the secret in `TURNSTILE_SECRET_KEY` in Vercel, set `NEXT_PUBLIC_TURNSTILE_ENABLED=true`, and **redeploy**, since the first two are build time. The code path is complete and off; nothing renders and nothing is verified until the flag is on.

### Confirm the analytics events fire in production

Four events: `signup_completed`, `progress_set`, `post_created`, `reveal_clicked`. Nothing has ever confirmed them against a live Vercel Analytics endpoint. Walk each flow once on production and check the Analytics tab.

## Later

Parked deliberately. Nothing here blocks launch.

- **Notifications.** The largest missing behaviour. The forum works but nothing brings a person back. An in app inbox reading replies to your posts, gated exactly like everything else, is a small amount of code and the biggest available change to retention. First thing to build after launch.
- **Entity pages.** Generated pages per vehicle, location, character, and mission, as an SEO surface and a navigation spine. Real work, real payoff once indexing is on.
- **Realtime groups.** Live updating group feeds and presence. Supabase Realtime makes it cheap; the spoiler gate over a live stream is the hard part.
- **Mobile app.** A wrapper is not worth it. A real one is a separate project.
- **AI assistant.** A summarizer or answer bot over the corpus. Interesting, and a spoiler leak waiting to happen unless the gate is applied to whatever it generates.
- **A better Top tab.** It is `vote_count` over the last seven days, which looks flat before launch and lumpy after. A decaying score computed in SQL would work at both traffic levels and would remove the offset pagination that ordering forced.
- **Reply editing.** Posts can be edited, replies cannot. The row level security policy already allows it; there is no UI.
- **Email digests.** Depends on Resend being wired up first.
- **A roles table.** Only worth it if moderation outgrows a list of uuids in an environment variable.

## Recently done

Kept here briefly so a reader does not re-open a decision that has already been made.

### Admin, moderation, and bot defenses, September 2026

Migration `0012`. Admin moved from `ADMIN_USER_IDS` onto `profiles.is_admin`, bans became `banned_at` enforced by row level security rather than by the UI, `admin_actions` records every moderator action, and the per IP signup limit proposed here was built as `public.record_signup_attempt`. Cloudflare Turnstile is wired into signup, sign in, and both composers, switched off pending keys.

### Outbound links, spam, and identity, September 2026

Migration `0013`. Every user authored link is nofollow ugc noopener and opens in a new tab, new accounts cannot post links until they are a day old or have earned an accepted answer or 3 upvotes, and a three rule spam filter hides and reports rather than refusing. Usernames became the public identity with a 30 day change cooldown, profiles gained a bio, and email is no longer changeable by anyone. Admins can edit both spam lists, rename an account, and clear a bio, all audited.

### Go live, September 3, 2026

- **Domain and DNS.** `askgta6.com` registered at Namecheap, DNS on BasicDNS under Advanced DNS, A record on `@` and CNAME on `www` pointing at Vercel. Both hostnames added to the Vercel project, www redirects to the apex with a 308, apex is canonical. `NEXT_PUBLIC_SITE_URL` set to `https://askgta6.com` and redeployed. Records and targets are in [system/infrastructure.md](system/infrastructure.md).
- **Supabase Auth URLs.** Site URL is the apex, and the allow list holds the apex, www, and localhost callback URLs. Getting this wrong is what made magic links point at localhost, because Supabase silently substitutes its Site URL for a redirect it does not recognise. The diagnosis path is written up in [system/runbook.md](system/runbook.md).
- **Resend SMTP, and "Confirm email" back on.** Finished **September 4, 2026**. `askgta6.com` verified in Resend with DKIM, two CNAMEs and a DMARC record at Namecheap, Supabase custom SMTP on `smtp.resend.com` port 465 as user `resend`, sending as `noreply@askgta6.com`. The built in Supabase sender is out of the path, so "Confirm email" is on without bottlenecking signups. What finally engaged it was saving the dashboard form with every field filled in one submit after toggling custom SMTP off and on; the confirmation is the Auth log line `updating Email limiter from 2/1h to 30`. Management API writes stored the config without engaging the service. Written up in [system/runbook.md](system/runbook.md).

### Earlier

- **`getUser` dedupe.** `getViewer` was already wrapped in React's `cache()`; the client factory was not, and forty odd call sites each rebuilt one per render. Both are cached now, and `tests/unit/request-cache.test.ts` counts the calls across a page tree so it stays that way.
