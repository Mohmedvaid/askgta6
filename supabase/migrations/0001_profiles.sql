-- Profiles: one row per auth user, created automatically at signup.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  avatar_path text,
  progress smallint not null default 0 check (progress between 0 and 7),
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  created_at timestamptz not null default now()
);

-- Placeholder usernames keep signup from ever failing on a collision or a missing choice.
-- Onboarding replaces anything still starting with player_.
create or replace function public.generate_placeholder_username()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  for _ in 1..10 loop
    candidate := 'player_' || substr(md5(gen_random_uuid()::text), 1, 6);
    if not exists (select 1 from public.profiles where username = candidate) then
      return candidate;
    end if;
  end loop;
  return 'player_' || substr(md5(gen_random_uuid()::text), 1, 12);
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, public.generate_placeholder_username())
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
