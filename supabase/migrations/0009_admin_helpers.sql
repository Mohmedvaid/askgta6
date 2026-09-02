-- Helpers the seed script and the admin actions call with the service role key.
-- Execute is revoked from public so no signed in client can reach them.

create or replace function public.set_accepted_reply_admin(p_post_id uuid, p_reply_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reply_id is not null and not exists (
    select 1 from public.replies where id = p_reply_id and post_id = p_post_id
  ) then
    raise exception 'reply does not belong to this post';
  end if;

  perform set_config('app.guard_off', 'on', true);
  update public.posts set accepted_reply_id = p_reply_id where id = p_post_id;
  perform set_config('app.guard_off', 'off', true);

  return p_reply_id;
end;
$$;

revoke execute on function public.set_accepted_reply_admin(uuid, uuid) from public;
