-- Admin, banning, an audit trail, and the per IP signup limit.
--
-- Admin moves out of the ADMIN_USER_IDS environment variable and into the
-- database, so row level security can see it. An env var cannot: every policy
-- below that grants an admin something has to read it from a row.
--
-- Additive throughout. Every column has a default, so the old code keeps working
-- against this schema until the deploy that reads the new columns lands.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text;

-- ---------------------------------------------------------------------------
-- Who is what
-- ---------------------------------------------------------------------------

-- security definer so a policy on profiles can call it without recursing into
-- that same policy. stable so the planner calls it once per statement.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.banned_at is not null from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_banned() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Banned users cannot write. Enforced here, not in the UI.
-- ---------------------------------------------------------------------------

-- Postgres has no "and also" for policies of the same command: multiple
-- permissive policies are ORed together. So the ban check goes inside the
-- existing insert policies by replacing them.

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and is_hidden = false
    and not public.is_banned()
    and (group_id is null or public.is_group_member(group_id))
  );

drop policy if exists replies_insert on public.replies;
create policy replies_insert on public.replies for insert to authenticated
  with check (
    author_id = auth.uid()
    and is_hidden = false
    and not public.is_banned()
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.is_hidden = false and public.can_read_group_content(p.group_id)
    )
  );

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_banned());

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and not public.is_banned());

-- Votes are written only through cast_vote, which is security definer and so
-- bypasses the policies above. The ban check has to go inside it.
--
-- This is 0005's function verbatim with four lines added. Do not rewrite it from
-- memory: the readability checks below are what stop a vote on a hidden post or a
-- post inside a group the voter cannot see, and they are easy to lose.
create or replace function public.cast_vote(p_target_type text, p_target_id uuid, p_value smallint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  voter uuid := auth.uid();
  total int;
begin
  if voter is null then
    raise exception 'sign in required';
  end if;
  if public.is_banned() then
    raise exception 'account is banned';
  end if;
  if p_target_type not in ('post', 'reply') then
    raise exception 'unknown target type';
  end if;
  if p_value not in (-1, 0, 1) then
    raise exception 'vote must be -1, 0, or 1';
  end if;

  if p_target_type = 'post' then
    if not exists (
      select 1 from public.posts p
      where p.id = p_target_id and p.is_hidden = false and public.can_read_group_content(p.group_id)
    ) then
      raise exception 'post not found';
    end if;
  else
    if not exists (
      select 1 from public.replies r join public.posts p on p.id = r.post_id
      where r.id = p_target_id and r.is_hidden = false and p.is_hidden = false
        and public.can_read_group_content(p.group_id)
    ) then
      raise exception 'reply not found';
    end if;
  end if;

  if p_value = 0 then
    delete from public.votes
    where user_id = voter and target_type = p_target_type and target_id = p_target_id;
  else
    insert into public.votes (user_id, target_type, target_id, value)
    values (voter, p_target_type, p_target_id, p_value)
    on conflict (user_id, target_type, target_id) do update set value = excluded.value;
  end if;

  if p_target_type = 'post' then
    select vote_count into total from public.posts where id = p_target_id;
  else
    select vote_count into total from public.replies where id = p_target_id;
  end if;

  return total;
end;
$$;

grant execute on function public.cast_vote(text, uuid, smallint) to authenticated;

-- A banned author must not be able to edit their way around the ban either.
drop policy if exists posts_update_author on public.posts;
create policy posts_update_author on public.posts for update to authenticated
  using (author_id = auth.uid() and not public.is_banned())
  with check (author_id = auth.uid() and not public.is_banned());

-- Only an admin may set the ban columns, and nobody may set their own is_admin.
-- profiles_update_own already restricts the row; this restricts the columns by
-- comparing against what is stored.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
    and banned_at is not distinct from (select p.banned_at from public.profiles p where p.id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Admins can read what they moderate
-- ---------------------------------------------------------------------------

create policy reports_select_admin on public.reports for select to authenticated
  using (public.is_admin());

create policy posts_select_admin on public.posts for select to authenticated
  using (public.is_admin());

create policy replies_select_admin on public.replies for select to authenticated
  using (public.is_admin());

grant select on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_actions_action_check check (
    action in ('hide', 'unhide', 'delete', 'dismiss', 'ban', 'unban', 'delete_account')
  ),
  constraint admin_actions_target_type_check check (
    target_type in ('post', 'reply', 'report', 'user')
  )
);

create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);
create index if not exists admin_actions_actor_idx on public.admin_actions (actor_id, created_at desc);

alter table public.admin_actions enable row level security;

-- Admins read the log. Nobody writes through a client: rows come from the server
-- with the service role key, so there is no insert policy at all.
create policy admin_actions_select_admin on public.admin_actions for select to authenticated
  using (public.is_admin());

grant select on public.admin_actions to authenticated;

-- ---------------------------------------------------------------------------
-- Per IP signup limit, the table proposed in docs/BACKLOG.md
-- ---------------------------------------------------------------------------

create table if not exists public.signup_attempts (
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists signup_attempts_ip_time_idx
  on public.signup_attempts (ip_hash, attempted_at desc);

alter table public.signup_attempts enable row level security;
-- No policies. Only the definer function below reaches this table. An IP address
-- is personal data, so only a hash of it is ever stored.

create or replace function public.record_signup_attempt(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  delete from public.signup_attempts where attempted_at < now() - interval '1 day';

  select count(*) into recent
  from public.signup_attempts
  where ip_hash = p_ip_hash and attempted_at > now() - interval '1 hour';

  if recent >= 5 then
    return false;
  end if;

  insert into public.signup_attempts (ip_hash) values (p_ip_hash);
  return true;
end;
$$;

revoke all on function public.record_signup_attempt(text) from public;
grant execute on function public.record_signup_attempt(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daily counts for the admin overview
-- ---------------------------------------------------------------------------

-- Plain views over a generated date series, so a day with nothing still has a row
-- and the dashboard does not have to fill gaps in TypeScript.
create or replace view public.admin_daily_counts as
select
  d.day::date as day,
  (select count(*) from public.profiles p where p.created_at >= d.day and p.created_at < d.day + interval '1 day') as signups,
  (select count(*) from public.posts p where p.created_at >= d.day and p.created_at < d.day + interval '1 day') as posts,
  (select count(*) from public.replies r where r.created_at >= d.day and r.created_at < d.day + interval '1 day') as replies
from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as d(day);

create or replace view public.admin_totals as
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.posts) as posts,
  (select count(*) from public.replies) as replies,
  (select count(*) from public.groups) as groups,
  (select count(*) from public.profiles where banned_at is not null) as banned,
  (select count(*) from public.posts where is_hidden) as hidden_posts,
  (select count(*) from public.replies where is_hidden) as hidden_replies,
  (select count(distinct (target_type, target_id)) from public.reports) as reported_items;

-- The views run as their owner, so they would leak counts to anyone who could
-- select from them. Nobody can: the dashboard reads them with the service role
-- key after checking is_admin in the action.
revoke all on public.admin_daily_counts from anon, authenticated;
revoke all on public.admin_totals from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The first admin
-- ---------------------------------------------------------------------------

-- Idempotent, and a no op on any project where that address has not signed up.
-- Recorded in docs/system/runbook.md as the thing to repeat for a new admin.
update public.profiles
set is_admin = true
where id in (select id from auth.users where lower(email) = 'mohmedvaid@gmail.com');
