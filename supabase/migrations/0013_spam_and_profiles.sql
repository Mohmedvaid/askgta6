-- Spam lists, a profile bio, and the username change cooldown.
--
-- Additive. Every column has a default or is nullable, so the schema is safe to
-- apply before the code that reads it.

-- ---------------------------------------------------------------------------
-- Profiles: bio, and the clock the username cooldown runs on
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists bio text,
  add column if not exists username_changed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_bio_length_check;
alter table public.profiles
  add constraint profiles_bio_length_check check (bio is null or char_length(bio) <= 200);

-- The cooldown is enforced in the database as well as in the action, because the
-- action is not the only thing that can reach this row: a client holding a session
-- can update profiles directly under the owner policy.
create or replace function public.enforce_username_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    -- The generated player_xxxxxx name was never a choice, so moving off it does
    -- not spend the cooldown and does not start the clock. That leaves one free
    -- correction for a name typed in a hurry at onboarding. Checked first, so it
    -- holds however the write arrives.
    if old.username like 'player\_%' then
      new.username_changed_at := old.username_changed_at;
      return new;
    end if;

    -- auth.uid() is null when there is no session, which means the service role
    -- key or a migration. An admin rename goes through the service role client, so
    -- without this an admin could not rename somebody who is on a cooldown, which
    -- is exactly when a rename is needed. Row level security already stops an
    -- anonymous client reaching this table at all.
    if public.is_admin() or auth.uid() is null then
      new.username_changed_at := now();
      return new;
    end if;

    if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
      raise exception 'username changed too recently'
        using errcode = 'check_violation';
    end if;

    new.username_changed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_username_cooldown on public.profiles;
create trigger profiles_username_cooldown
  before update on public.profiles
  for each row execute function public.enforce_username_cooldown();

-- ---------------------------------------------------------------------------
-- Spam lists
-- ---------------------------------------------------------------------------

create table if not exists public.blocked_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.blocked_phrases (
  id uuid primary key default gen_random_uuid(),
  phrase text not null unique,
  note text,
  created_at timestamptz not null default now()
);

alter table public.blocked_domains enable row level security;
alter table public.blocked_phrases enable row level security;

-- Admins read them in the dashboard. Nothing writes through a client: the lists are
-- edited by server actions holding the service role key, after requireAdmin.
create policy blocked_domains_select_admin on public.blocked_domains for select to authenticated
  using (public.is_admin());
create policy blocked_phrases_select_admin on public.blocked_phrases for select to authenticated
  using (public.is_admin());

grant select on public.blocked_domains, public.blocked_phrases to authenticated;

-- Seed. URL shorteners hide where a link goes, which is the whole point of them and
-- the reason they are useless to a forum that shows link targets. Paste sites are
-- where the payload usually lives.
insert into public.blocked_domains (domain, note) values
  ('bit.ly', 'shortener'),
  ('tinyurl.com', 'shortener'),
  ('goo.gl', 'shortener'),
  ('t.co', 'shortener'),
  ('ow.ly', 'shortener'),
  ('is.gd', 'shortener'),
  ('buff.ly', 'shortener'),
  ('rebrand.ly', 'shortener'),
  ('cutt.ly', 'shortener'),
  ('shorturl.at', 'shortener'),
  ('tiny.cc', 'shortener'),
  ('rb.gy', 'shortener'),
  ('t.ly', 'shortener'),
  ('bit.do', 'shortener'),
  ('adf.ly', 'shortener and ad interstitial'),
  ('pastebin.com', 'paste site'),
  ('paste.ee', 'paste site'),
  ('ghostbin.com', 'paste site'),
  ('hastebin.com', 'paste site'),
  ('controlc.com', 'paste site'),
  ('justpaste.it', 'paste site'),
  ('telegra.ph', 'paste site')
on conflict (domain) do nothing;

-- Phrases are matched against a normalized body, so these are lowercase and
-- punctuation free. Each is scam bait rather than a word anyone discussing a game
-- would reach for on its own.
insert into public.blocked_phrases (phrase, note) values
  ('free money', 'scam bait'),
  ('free giveaway', 'scam bait'),
  ('giveaway winner', 'scam bait'),
  ('claim your prize', 'scam bait'),
  ('free nitro', 'discord nitro scam'),
  ('discord nitro', 'discord nitro scam'),
  ('steam gift', 'gift card scam'),
  ('gift card', 'gift card scam'),
  ('crypto pump', 'crypto scam'),
  ('pump and dump', 'crypto scam'),
  ('double your', 'crypto scam'),
  ('investment opportunity', 'crypto scam'),
  ('dm me', 'off platform contact'),
  ('pm me', 'off platform contact'),
  ('message me on telegram', 'off platform contact'),
  ('telegram', 'off platform contact'),
  ('whatsapp', 'off platform contact'),
  ('hit me up on', 'off platform contact')
on conflict (phrase) do nothing;

-- ---------------------------------------------------------------------------
-- Link privileges
-- ---------------------------------------------------------------------------

-- Reputation for the link gate: whether this account has an accepted answer, and
-- how many upvotes its posts and replies have received. Definer because it reads
-- rows the caller may not be able to see, and it returns two integers, not content.
create or replace function public.link_privilege_stats(p_user_id uuid)
returns table (accepted_answers bigint, upvotes_received bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.posts p where p.accepted_reply_id in (
      select r.id from public.replies r where r.author_id = p_user_id
    )),
    (
      coalesce((select sum(greatest(p.vote_count, 0)) from public.posts p where p.author_id = p_user_id), 0)
      + coalesce((select sum(greatest(r.vote_count, 0)) from public.replies r where r.author_id = p_user_id), 0)
    );
$$;

grant execute on function public.link_privilege_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Duplicate detection
-- ---------------------------------------------------------------------------

-- The normalized body of recent posts and replies, for the sixty minute duplicate
-- check. A view rather than a column, so nothing has to be backfilled and the
-- normalization can change without a migration.
create or replace view public.recent_body_hashes as
select 'post' as kind, p.id, p.author_id, md5(lower(regexp_replace(p.body, '\s+', ' ', 'g'))) as body_hash, p.created_at
from public.posts p
where p.created_at > now() - interval '60 minutes'
union all
select 'reply', r.id, r.author_id, md5(lower(regexp_replace(r.body, '\s+', ' ', 'g'))), r.created_at
from public.replies r
where r.created_at > now() - interval '60 minutes';

revoke all on public.recent_body_hashes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit actions for the new admin controls
-- ---------------------------------------------------------------------------

alter table public.admin_actions
  drop constraint if exists admin_actions_action_check;
alter table public.admin_actions
  add constraint admin_actions_action_check check (
    action in (
      'hide', 'unhide', 'delete', 'dismiss', 'ban', 'unban', 'delete_account',
      'block_add', 'block_remove', 'rename_user', 'clear_bio'
    )
  );

alter table public.admin_actions
  drop constraint if exists admin_actions_target_type_check;
alter table public.admin_actions
  add constraint admin_actions_target_type_check check (
    target_type in ('post', 'reply', 'report', 'user', 'domain', 'phrase')
  );

-- A blocked list row has a uuid of its own, so target_id keeps its type.
