-- Posts and replies, the content of the forum.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  topic text not null check (topic in ('story', 'vehicles', 'locations', 'map', 'characters', 'help', 'general')),
  kind text not null check (kind in ('question', 'discussion')),
  title text not null check (char_length(title) between 8 and 140),
  body text not null check (char_length(body) between 1 and 10000),
  spoiler_level smallint not null default 0 check (spoiler_level between 0 and 7),
  vote_count int not null default 0,
  reply_count int not null default 0,
  accepted_reply_id uuid,
  is_hidden boolean not null default false,
  search tsvector generated always as (to_tsvector('english', title || ' ' || body)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_created_idx on public.posts (created_at desc, id desc);
create index posts_votes_idx on public.posts (vote_count desc, created_at desc);
create index posts_group_idx on public.posts (group_id, created_at desc);
create index posts_topic_idx on public.posts (topic, created_at desc);
create index posts_author_idx on public.posts (author_id);
create index posts_search_idx on public.posts using gin (search);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  spoiler_level smallint not null default 0 check (spoiler_level between 0 and 7),
  vote_count int not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index replies_post_idx on public.replies (post_id, created_at);
create index replies_author_idx on public.replies (author_id);

alter table public.posts
  add constraint posts_accepted_reply_fk
  foreign key (accepted_reply_id) references public.replies(id) on delete set null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger posts_touch before update on public.posts
for each row execute function public.touch_updated_at();

create trigger replies_touch before update on public.replies
for each row execute function public.touch_updated_at();

create or replace function public.sync_post_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reply_count = reply_count + 1 where id = new.post_id;
    return new;
  end if;
  update public.posts set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

create trigger replies_count_ins after insert on public.replies
for each row execute function public.sync_post_reply_count();

create trigger replies_count_del after delete on public.replies
for each row execute function public.sync_post_reply_count();

-- Columns the server owns. Clients may never write them, whatever RLS lets them update.
-- Trigger depth above 1 means one of our own triggers is doing the write.
create or replace function public.guard_server_owned_columns()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 or coalesce(current_setting('app.guard_off', true), '') = 'on' then
    return new;
  end if;

  if tg_table_name = 'posts' then
    if new.vote_count is distinct from old.vote_count
      or new.reply_count is distinct from old.reply_count
      or new.is_hidden is distinct from old.is_hidden
      or new.accepted_reply_id is distinct from old.accepted_reply_id
      or new.author_id is distinct from old.author_id then
      raise exception 'column is maintained by the server and cannot be written directly';
    end if;
  else
    if new.vote_count is distinct from old.vote_count
      or new.is_hidden is distinct from old.is_hidden
      or new.author_id is distinct from old.author_id
      or new.post_id is distinct from old.post_id then
      raise exception 'column is maintained by the server and cannot be written directly';
    end if;
  end if;

  return new;
end;
$$;

create trigger posts_guard_columns before update on public.posts
for each row execute function public.guard_server_owned_columns();

create trigger replies_guard_columns before update on public.replies
for each row execute function public.guard_server_owned_columns();

-- Rate limit: at most 5 posts and 15 replies per author per minute.
create or replace function public.enforce_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  select count(*) into recent
  from public.posts
  where author_id = new.author_id and created_at > now() - interval '60 seconds';

  if recent >= 5 then
    raise exception 'rate limit: too many posts in the last minute' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_reply_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  select count(*) into recent
  from public.replies
  where author_id = new.author_id and created_at > now() - interval '60 seconds';

  if recent >= 15 then
    raise exception 'rate limit: too many replies in the last minute' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger posts_rate_limit before insert on public.posts
for each row execute function public.enforce_post_rate_limit();

create trigger replies_rate_limit before insert on public.replies
for each row execute function public.enforce_reply_rate_limit();
