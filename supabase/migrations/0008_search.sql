-- Ranked full text search. Invoker rights on purpose: row level security still
-- applies, so a private group's posts stay out of everyone else's results.

create or replace function public.search_posts(p_query text, p_limit int default 20, p_offset int default 0)
returns setof public.posts
language sql
stable
as $$
  select p.*
  from public.posts p
  where p.search @@ websearch_to_tsquery('english', p_query)
  order by ts_rank(p.search, websearch_to_tsquery('english', p_query)) desc, p.created_at desc, p.id desc
  limit least(coalesce(p_limit, 20), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_posts(text, int, int) to anon, authenticated;
