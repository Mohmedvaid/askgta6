-- Callable functions. Security definer only where RLS makes the plain query impossible.

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_read_group_content(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_group_id is null
     or exists (select 1 from public.groups where id = p_group_id and visibility = 'public')
     or public.is_group_member(p_group_id);
$$;

create or replace function public.set_progress(new_level smallint)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  if new_level < 0 or new_level > 7 then
    raise exception 'progress must be between 0 and 7';
  end if;

  update public.profiles set progress = new_level where id = auth.uid();
  return new_level;
end;
$$;

create or replace function public.accept_reply(p_post_id uuid, p_reply_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
begin
  select author_id into post_author from public.posts where id = p_post_id;
  if post_author is null then
    raise exception 'post not found';
  end if;
  if post_author is distinct from auth.uid() then
    raise exception 'only the post author can accept a reply';
  end if;

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

create or replace function public.set_hidden(p_target_type text, p_target_id uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_target_type not in ('post', 'reply') then
    raise exception 'unknown target type';
  end if;

  perform set_config('app.guard_off', 'on', true);
  if p_target_type = 'post' then
    update public.posts set is_hidden = p_hidden where id = p_target_id;
  else
    update public.replies set is_hidden = p_hidden where id = p_target_id;
  end if;
  perform set_config('app.guard_off', 'off', true);

  return p_hidden;
end;
$$;

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

create or replace function public.join_group_by_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.group_invites;
  target public.groups;
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;

  select * into invite from public.group_invites where code = p_code;
  if invite.id is null then
    raise exception 'invite code not found';
  end if;
  if invite.expires_at is not null and invite.expires_at < now() then
    raise exception 'invite code has expired';
  end if;

  select * into target from public.groups where id = invite.group_id;

  insert into public.group_members (group_id, user_id, role)
  values (target.id, auth.uid(), 'member')
  on conflict do nothing;

  return target.slug;
end;
$$;
