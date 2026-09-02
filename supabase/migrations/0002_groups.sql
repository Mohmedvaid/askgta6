-- Groups, membership, and invite codes.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  name text not null check (char_length(name) between 2 and 60),
  description text check (description is null or char_length(description) <= 500),
  visibility text not null check (visibility in ('public', 'private')),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  member_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  code text not null unique check (char_length(code) between 6 and 24),
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index group_invites_group_idx on public.group_invites (group_id);

create or replace function public.sync_group_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
    return new;
  end if;
  update public.groups set member_count = greatest(member_count - 1, 0) where id = old.group_id;
  return old;
end;
$$;

create trigger group_members_count_ins
after insert on public.group_members
for each row execute function public.sync_group_member_count();

create trigger group_members_count_del
after delete on public.group_members
for each row execute function public.sync_group_member_count();

-- The owner is always a member. Written as a trigger so every creation path agrees.
create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger groups_add_owner
after insert on public.groups
for each row execute function public.add_owner_as_member();
