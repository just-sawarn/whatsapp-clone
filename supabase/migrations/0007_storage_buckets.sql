-- Storage: private buckets, all reads through signed URLs. Paths encode ownership so policies stay simple:
--   avatars       {user_id}/{file}
--   chat-media    {chat_id}/{sender_id}/{file}   (client-side AES-GCM ciphertext, never plaintext)
--   status-media  {user_id}/{file}

create or replace function public.storage_uuid(value text)
returns uuid
language sql
immutable
as $$
  select case
    when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then value::uuid
  end;
$$;

-- Who may see a profile photo, per the owner's show_profile_photo setting.
create or replace function public.can_see_avatar(owner_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select owner_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = owner_user_id
        and not exists (
          select 1 from public.contacts blocked
          where blocked.owner_id = owner_user_id and blocked.contact_id = auth.uid() and blocked.is_blocked
        )
        and (
          p.show_profile_photo = 'everyone'
          or (
            p.show_profile_photo = 'contacts'
            and exists (select 1 from public.contacts c where c.owner_id = owner_user_id and c.contact_id = auth.uid())
          )
        )
    );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('chat-media', 'chat-media', false, 20971520, array['application/octet-stream']),
  ('status-media', 'status-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_see_avatar(public.storage_uuid((storage.foldername(name))[1])));
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy chat_media_select_member on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.is_chat_member(public.storage_uuid((storage.foldername(name))[1])));
create policy chat_media_insert_member on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.is_chat_member(public.storage_uuid((storage.foldername(name))[1]))
    and (storage.foldername(name))[2] = auth.uid()::text
  );
create policy chat_media_delete_sender on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[2] = auth.uid()::text);

create policy status_media_select_allowed on storage.objects for select to authenticated
  using (bucket_id = 'status-media' and public.can_view_status(public.storage_uuid((storage.foldername(name))[1])));
create policy status_media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'status-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy status_media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'status-media' and (storage.foldername(name))[1] = auth.uid()::text);

revoke all on function public.storage_uuid(text), public.can_see_avatar(uuid) from public;
grant execute on function public.storage_uuid(text), public.can_see_avatar(uuid) to authenticated;
