-- Row level security. Deny by default on every table.

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.posts enable row level security;
alter table public.replies enable row level security;
alter table public.votes enable row level security;
alter table public.reports enable row level security;

-- profiles: public read, owner update, no client insert or delete.
create policy profiles_select on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- groups: public groups are visible to everyone, private ones to their members.
create policy groups_select on public.groups for select
  using (visibility = 'public' or public.is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy groups_update_owner on public.groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy groups_delete_owner on public.groups for delete to authenticated
  using (owner_id = auth.uid());

-- group_members: members see the roster. Public groups can be joined directly,
-- private groups only through join_group_by_invite, which is security definer.
create policy group_members_select on public.group_members for select
  using (public.is_group_member(group_id));
create policy group_members_insert_public on public.group_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (select 1 from public.groups g where g.id = group_id and g.visibility = 'public')
  );
create policy group_members_delete on public.group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- group_invites: owners manage them. Redemption happens through the definer function,
-- so no select policy is needed for the person pasting a code.
create policy group_invites_select_owner on public.group_invites for select to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy group_invites_insert_owner on public.group_invites for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );
create policy group_invites_delete_owner on public.group_invites for delete to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));

-- posts: hidden posts are visible only to their author. Group posts follow group visibility.
create policy posts_select on public.posts for select
  using (
    (is_hidden = false and public.can_read_group_content(group_id))
    or author_id = auth.uid()
  );
create policy posts_insert on public.posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and is_hidden = false
    and (group_id is null or public.is_group_member(group_id))
  );
create policy posts_update_author on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete_author on public.posts for delete to authenticated
  using (author_id = auth.uid());

-- replies: same visibility as the post they belong to.
create policy replies_select on public.replies for select
  using (
    (
      is_hidden = false
      and exists (
        select 1 from public.posts p
        where p.id = post_id and p.is_hidden = false and public.can_read_group_content(p.group_id)
      )
    )
    or author_id = auth.uid()
  );
create policy replies_insert on public.replies for insert to authenticated
  with check (
    author_id = auth.uid()
    and is_hidden = false
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.is_hidden = false and public.can_read_group_content(p.group_id)
    )
  );
create policy replies_update_author on public.replies for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy replies_delete_author on public.replies for delete to authenticated
  using (author_id = auth.uid());

-- votes: read your own, write only through cast_vote.
create policy votes_select_own on public.votes for select to authenticated
  using (user_id = auth.uid());

-- reports: file your own, read none.
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- Grants. Supabase applies these by default on new tables, they are written out here
-- so the same migrations produce the same permissions inside the pglite test harness.
grant usage on schema public to anon, authenticated;

grant select on public.profiles, public.groups, public.group_members, public.group_invites,
  public.posts, public.replies, public.votes to anon, authenticated;

grant update on public.profiles to authenticated;
grant insert, update, delete on public.groups to authenticated;
grant insert, delete on public.group_members to authenticated;
grant insert, delete on public.group_invites to authenticated;
grant insert, update, delete on public.posts to authenticated;
grant insert, update, delete on public.replies to authenticated;
grant insert on public.reports to authenticated;

grant execute on function public.set_progress(smallint) to authenticated;
grant execute on function public.accept_reply(uuid, uuid) to authenticated;
grant execute on function public.cast_vote(text, uuid, smallint) to authenticated;
grant execute on function public.join_group_by_invite(text) to authenticated;
grant execute on function public.is_group_member(uuid) to anon, authenticated;
grant execute on function public.can_read_group_content(uuid) to anon, authenticated;
-- set_hidden is admin only and is called with the service role key from the server.
revoke execute on function public.set_hidden(text, uuid, boolean) from public;
