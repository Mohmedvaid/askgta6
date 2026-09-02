-- Avatar storage. Supabase provides the storage schema, pglite does not, so this
-- whole migration is a no-op inside the test harness.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$drop policy if exists avatars_public_read on storage.objects$p$;
  execute $p$create policy avatars_public_read on storage.objects for select
    using (bucket_id = 'avatars')$p$;

  execute $p$drop policy if exists avatars_owner_write on storage.objects$p$;
  execute $p$create policy avatars_owner_write on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute $p$drop policy if exists avatars_owner_update on storage.objects$p$;
  execute $p$create policy avatars_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute $p$drop policy if exists avatars_owner_delete on storage.objects$p$;
  execute $p$create policy avatars_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end;
$$;
