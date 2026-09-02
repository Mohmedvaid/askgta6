-- Votes and reports.

create table public.votes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply')),
  target_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create index votes_target_idx on public.votes (target_type, target_id);

create or replace function public.sync_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_type text := coalesce(new.target_type, old.target_type);
  t_id uuid := coalesce(new.target_id, old.target_id);
  total int;
begin
  select coalesce(sum(value), 0) into total
  from public.votes
  where target_type = t_type and target_id = t_id;

  if t_type = 'post' then
    update public.posts set vote_count = total where id = t_id;
  else
    update public.replies set vote_count = total where id = t_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger votes_sync_ins after insert on public.votes
for each row execute function public.sync_vote_count();

create trigger votes_sync_upd after update on public.votes
for each row execute function public.sync_vote_count();

create trigger votes_sync_del after delete on public.votes
for each row execute function public.sync_vote_count();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'leak', 'harassment', 'wrong_spoiler_level', 'other')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index reports_target_idx on public.reports (target_type, target_id);

-- Five distinct reporters hides the content pending human review.
create or replace function public.auto_hide_reported_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reporters int;
begin
  select count(distinct reporter_id) into reporters
  from public.reports
  where target_type = new.target_type and target_id = new.target_id;

  if reporters >= 5 then
    if new.target_type = 'post' then
      update public.posts set is_hidden = true where id = new.target_id;
    else
      update public.replies set is_hidden = true where id = new.target_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger reports_auto_hide after insert on public.reports
for each row execute function public.auto_hide_reported_target();
