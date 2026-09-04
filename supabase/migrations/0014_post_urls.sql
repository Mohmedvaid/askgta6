-- Readable post URLs: /ask/<short_id>/<slug> and /talk/<short_id>/<slug>.
--
-- The short id is what resolves a post. The slug is decoration: it is derived
-- from the title and rebuilt on every write, so it can go stale in a link
-- without breaking it. A request carrying the wrong slug, or the wrong prefix
-- for the post's kind, is redirected to the canonical path by the app.

alter table public.posts add column short_id text;
alter table public.posts add column slug text;

-- Base 36, eight characters. 2.8e12 of them, so a collision is a retry rather
-- than a design problem, and the loop makes that retry automatic.
-- Security definer, so the uniqueness check reads the whole table. Under the
-- caller's own row level security it would not see a hidden post or one in a
-- private group, and would hand out an id the unique index then refuses.
create or replace function public.generate_post_short_id()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
  candidate text;
  position int;
begin
  loop
    candidate := '';
    for position in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 36)::int, 1);
    end loop;
    exit when not exists (select 1 from public.posts where short_id = candidate);
  end loop;
  return candidate;
end;
$$;

-- Lowercase, hyphens, 60 characters. A title of nothing but punctuation still
-- has to produce something, so it falls back to a word rather than an empty path
-- segment.
create or replace function public.post_slug(p_title text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(
        left(trim(both '-' from regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g')), 60),
        '-+$',
        ''
      ),
      ''
    ),
    'post'
  );
$$;

/**
 * The short id is assigned once and never moves, so a link that has been shared
 * keeps resolving. It is generated here rather than taken from the insert, so a
 * client cannot choose its own.
 *
 * The slug follows the title and nothing else. An unchanged title keeps the slug
 * it already had rather than whatever arrived in the column, which is both the
 * cheap path (vote and reply counters update this table constantly) and the one
 * that stops a client writing its own.
 */
create or replace function public.posts_set_url_parts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.short_id := public.generate_post_short_id();
    new.slug := public.post_slug(new.title);
  else
    new.short_id := old.short_id;
    new.slug := case when new.title is distinct from old.title then public.post_slug(new.title) else old.slug end;
  end if;

  return new;
end;
$$;

-- Backfill before the trigger exists, one row at a time: inside a single update
-- statement the uniqueness check would read a snapshot taken before any of it,
-- and hand out the same id twice.
do $$
declare
  row_id uuid;
begin
  for row_id in select id from public.posts loop
    update public.posts
    set short_id = public.generate_post_short_id(),
        slug = public.post_slug(title)
    where id = row_id;
  end loop;
end;
$$;

alter table public.posts alter column short_id set not null;
alter table public.posts alter column slug set not null;
alter table public.posts add constraint posts_short_id_format check (short_id ~ '^[0-9a-z]{8}$');
alter table public.posts add constraint posts_slug_length check (char_length(slug) between 1 and 60);
create unique index posts_short_id_key on public.posts (short_id);

create trigger posts_url_parts
  before insert or update on public.posts
  for each row execute function public.posts_set_url_parts();
