-- Photos for groups and communities. A community's photo is its announcements group's photo, so there is one
-- source of truth (chats.avatar_url) and one bucket. Unlike profile photos (which follow the uploader's privacy
-- setting), a group photo is visible to everyone who is in the group, and to community members for the groups
-- of their community, so they can recognise a group before joining it.
--   chat-avatars  {chat_id}/{file}

alter table public.profiles alter column about set default 'Hey there! I am using ChatBit.';

create or replace function public.can_see_chat_avatar(target_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_chat_id is not null and (
    public.is_chat_member(target_chat_id)
    or exists (
      select 1 from public.community_groups g
      where g.chat_id = target_chat_id and public.is_community_member(g.community_id)
    )
  );
$$;

-- Only admins of a group (never a direct chat) may change its photo.
create or replace function public.can_edit_chat_avatar(target_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_chat_id is not null
    and public.is_chat_admin(target_chat_id)
    and exists (select 1 from public.chats where id = target_chat_id and is_group);
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('chat-avatars', 'chat-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy chat_avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-avatars' and public.can_see_chat_avatar(public.storage_uuid((storage.foldername(name))[1])));
create policy chat_avatars_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-avatars' and public.can_edit_chat_avatar(public.storage_uuid((storage.foldername(name))[1])));
create policy chat_avatars_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'chat-avatars' and public.can_edit_chat_avatar(public.storage_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'chat-avatars' and public.can_edit_chat_avatar(public.storage_uuid((storage.foldername(name))[1])));
create policy chat_avatars_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'chat-avatars' and public.can_edit_chat_avatar(public.storage_uuid((storage.foldername(name))[1])));

-- A chat's photo must live in that chat's own folder, so an admin cannot point it at another chat's file.
create or replace function public.enforce_chat_avatar_path()
returns trigger
language plpgsql
as $$
begin
  if new.avatar_url is not null and new.avatar_url not like new.id::text || '/%' then
    raise exception 'A chat photo must be stored in the chat''s own folder';
  end if;
  return new;
end;
$$;

create trigger chats_enforce_avatar_path before insert or update of avatar_url on public.chats
for each row execute function public.enforce_chat_avatar_path();

-- ---------------------------------------------------------------- community RPCs return the photo
drop function public.community_overview();
create function public.community_overview()
returns table (
  community_id uuid,
  name text,
  description text,
  announcement_chat_id uuid,
  member_count bigint,
  group_count bigint,
  my_role text,
  created_at timestamptz,
  avatar_url text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.description,
    c.announcement_chat_id,
    (select count(*) from public.chat_participants p where p.chat_id = c.announcement_chat_id),
    (select count(*) from public.community_groups g where g.community_id = c.id),
    me.role,
    c.created_at,
    ch.avatar_url
  from public.communities c
  join public.chats ch on ch.id = c.announcement_chat_id
  join public.chat_participants me on me.chat_id = c.announcement_chat_id and me.user_id = auth.uid()
  order by c.created_at desc;
$$;

drop function public.community_groups_overview(uuid);
create function public.community_groups_overview(target_community_id uuid)
returns table (
  chat_id uuid,
  name text,
  member_count bigint,
  is_member boolean,
  my_role text,
  added_at timestamptz,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_community_member(target_community_id) then
    raise exception 'You are not a member of this community';
  end if;
  return query
    select
      g.chat_id,
      ch.name,
      (select count(*) from public.chat_participants p where p.chat_id = g.chat_id),
      mine.user_id is not null,
      mine.role,
      g.added_at,
      ch.avatar_url
    from public.community_groups g
    join public.chats ch on ch.id = g.chat_id
    left join public.chat_participants mine on mine.chat_id = g.chat_id and mine.user_id = auth.uid()
    where g.community_id = target_community_id
    order by g.added_at;
end;
$$;

revoke all on function public.can_see_chat_avatar(uuid), public.can_edit_chat_avatar(uuid),
  public.community_overview(), public.community_groups_overview(uuid) from public;
grant execute on function public.can_see_chat_avatar(uuid), public.can_edit_chat_avatar(uuid),
  public.community_overview(), public.community_groups_overview(uuid) to authenticated;
