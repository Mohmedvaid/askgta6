-- The parts of a Supabase project that migrations depend on but do not create.
-- Kept deliberately minimal: an auth schema, an auth.users table, auth.uid(),
-- and the anon and authenticated roles.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  -- The claims setting is an empty string once a test has reset it, and an empty
  -- string is not valid json. Supabase's own definition guards the same way, so
  -- this matches it rather than working around the harness.
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
      ''
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', 'anon');
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
