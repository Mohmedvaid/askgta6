-- The spoiler shield is opt in. A reader who has not turned it on sees everything,
-- so the column defaults to false and existing rows keep their progress untouched.

alter table public.profiles
  add column if not exists spoiler_shield boolean not null default false;
