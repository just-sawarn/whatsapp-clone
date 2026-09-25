-- Communities: an umbrella over several groups.
--
-- A community owns one "announcements" chat (a group where only admins may post). Being a member of the
-- community IS being a member of that chat, so encryption, roles, adding and removing members all work exactly as
-- they do for any group. Other groups can be linked to the community; community members may join them.

alter table public.chats add column announcement_only boolean not null default false;

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  announcement_chat_id uuid not null unique references public.chats (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.community_groups (
  community_id uuid not null references public.communities (id) on delete cascade,
  chat_id uuid not null unique references public.chats (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (community_id, chat_id)
);

-- One active invite code per community. Only the SECURITY DEFINER functions below touch it.
create table public.community_invites (
  community_id uuid primary key references public.communities (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.communities enable row level security;
alter table public.community_groups enable row level security;
alter table public.community_invites enable row level security;

-- ---------------------------------------------------------------- helpers
create or replace function public.is_community_member(target_community_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communities c
    join public.chat_participants p on p.chat_id = c.announcement_chat_id
    where c.id = target_community_id and p.user_id = target_user_id
  );
$$;

create or replace function public.is_community_admin(target_community_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communities c
    join public.chat_participants p on p.chat_id = c.announcement_chat_id
    where c.id = target_community_id and p.user_id = target_user_id and p.role = 'admin'
  );
$$;

-- In an announcements chat only admins may post; everywhere else any member may.
create or replace function public.can_post_in_chat(target_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.chats where id = target_chat_id and announcement_only)
    or public.is_chat_admin(target_chat_id);
$$;

drop policy messages_insert_member_sender on public.messages;
create policy messages_insert_member_sender on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(chat_id) and public.can_post_in_chat(chat_id));

create policy communities_select_member on public.communities for select to authenticated
  using (public.is_community_member(id));
create policy community_groups_select_member on public.community_groups for select to authenticated
  using (public.is_community_member(community_id));
-- No insert/update/delete policies: every change goes through the functions below, which check the caller.

-- ---------------------------------------------------------------- keep things consistent
-- The community name and its announcements chat name are the same thing; renaming either updates both.
create or replace function public.sync_community_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.communities set name = new.name where announcement_chat_id = new.id and name is distinct from new.name;
  end if;
  return new;
end;
$$;

create trigger chats_sync_community_name after update of name on public.chats
for each row execute function public.sync_community_name();

-- Leaving (or being removed from) the community's announcements chat also removes you from its linked groups.
create or replace function public.cascade_community_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select id into target from public.communities where announcement_chat_id = old.chat_id;
  if target is not null then
    delete from public.chat_participants
    where user_id = old.user_id
      and chat_id in (select chat_id from public.community_groups where community_id = target);
  end if;
  return old;
end;
$$;

create trigger participants_cascade_community_leave after delete on public.chat_participants
for each row execute function public.cascade_community_leave();

-- get_or_create_group_chat must never hand back an announcements chat that happens to have the same name and members.
create or replace function public.get_or_create_group_chat(group_name text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_name text := trim(coalesce(group_name, ''));
  desired_members uuid[];
  existing_chat_id uuid;
  new_chat_id uuid := gen_random_uuid();
  joining_user uuid;
begin
  if current_user_id is null or char_length(clean_name) not between 1 and 100 then
    raise exception 'Invalid group details';
  end if;

  select array_agg(distinct m.uid order by m.uid) into desired_members
  from unnest(array_append(coalesce(member_ids, '{}'::uuid[]), current_user_id)) as m(uid);

  if coalesce(array_length(desired_members, 1), 0) < 2 then
    raise exception 'A group needs at least one other member';
  end if;
  if array_length(desired_members, 1) > 256 then
    raise exception 'A group can have at most 256 participants';
  end if;
  if exists (select 1 from unnest(desired_members) as m(uid) where not exists (select 1 from public.profiles p where p.id = m.uid)) then
    raise exception 'One or more members do not exist';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || lower(clean_name) || array_to_string(desired_members, ','), 0));

  select c.id into existing_chat_id
  from public.chats c
  where c.is_group
    and not c.announcement_only
    and lower(trim(c.name)) = lower(clean_name)
    and exists (select 1 from public.chat_participants mine where mine.chat_id = c.id and mine.user_id = current_user_id)
    and (select count(*) from public.chat_participants members where members.chat_id = c.id) = array_length(desired_members, 1)
    and not exists (
      select 1 from public.chat_participants members
      where members.chat_id = c.id and not (members.user_id = any (desired_members))
    )
  limit 1;

  if existing_chat_id is not null then
    return existing_chat_id;
  end if;

  insert into public.chats (id, is_group, name, created_by) values (new_chat_id, true, clean_name, current_user_id);
  insert into public.chat_participants (chat_id, user_id, role) values (new_chat_id, current_user_id, 'admin');
  foreach joining_user in array desired_members loop
    if joining_user <> current_user_id then
      insert into public.chat_participants (chat_id, user_id, role) values (new_chat_id, joining_user, 'member');
    end if;
  end loop;
  return new_chat_id;
end;
$$;

-- ---------------------------------------------------------------- creating and editing
create or replace function public.create_community(community_name text, community_description text default '', member_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean_name text := trim(coalesce(community_name, ''));
  clean_description text := trim(coalesce(community_description, ''));
  chat_id uuid := gen_random_uuid();
  community_id uuid := gen_random_uuid();
  joining_user uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(clean_name) not between 1 and 100 then
    raise exception 'A community name must be 1 to 100 characters';
  end if;
  if char_length(clean_description) > 500 then
    raise exception 'A description can be at most 500 characters';
  end if;

  insert into public.chats (id, is_group, name, created_by, announcement_only)
  values (chat_id, true, clean_name, me, true);
  insert into public.chat_participants (chat_id, user_id, role) values (chat_id, me, 'admin');
  foreach joining_user in array (select coalesce(array_agg(distinct m), '{}'::uuid[]) from unnest(coalesce(member_ids, '{}'::uuid[])) as m where m <> me) loop
    if not exists (select 1 from public.profiles where id = joining_user) then
      raise exception 'One or more members do not exist';
    end if;
    insert into public.chat_participants (chat_id, user_id, role) values (chat_id, joining_user, 'member');
  end loop;

  insert into public.communities (id, name, description, created_by, announcement_chat_id)
  values (community_id, clean_name, clean_description, me, chat_id);
  return community_id;
end;
$$;

create or replace function public.update_community(target_community_id uuid, new_name text, new_description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := trim(coalesce(new_name, ''));
  clean_description text := trim(coalesce(new_description, ''));
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'Only community admins can edit the community';
  end if;
  if char_length(clean_name) not between 1 and 100 then
    raise exception 'A community name must be 1 to 100 characters';
  end if;
  if char_length(clean_description) > 500 then
    raise exception 'A description can be at most 500 characters';
  end if;
  update public.communities set name = clean_name, description = clean_description where id = target_community_id;
  update public.chats set name = clean_name
  where id = (select announcement_chat_id from public.communities where id = target_community_id) and name is distinct from clean_name;
end;
$$;

-- Ends the community. Its groups stay as ordinary groups; the announcements chat and its history are deleted.
create or replace function public.deactivate_community(target_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  announcements uuid;
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'Only community admins can deactivate the community';
  end if;
  select announcement_chat_id into announcements from public.communities where id = target_community_id;
  -- Unlink first so removing the announcements members below cannot pull anyone out of the groups.
  delete from public.community_groups where community_id = target_community_id;
  delete from public.communities where id = target_community_id;
  delete from public.chats where id = announcements;
end;
$$;

-- ---------------------------------------------------------------- overview
create or replace function public.community_overview()
returns table (
  community_id uuid,
  name text,
  description text,
  announcement_chat_id uuid,
  member_count bigint,
  group_count bigint,
  my_role text,
  created_at timestamptz
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
    c.created_at
  from public.communities c
  join public.chat_participants me on me.chat_id = c.announcement_chat_id and me.user_id = auth.uid()
  order by c.created_at desc;
$$;

-- The groups inside a community, including ones I have not joined (whose rows I cannot otherwise read).
create or replace function public.community_groups_overview(target_community_id uuid)
returns table (
  chat_id uuid,
  name text,
  member_count bigint,
  is_member boolean,
  my_role text,
  added_at timestamptz
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
      g.added_at
    from public.community_groups g
    join public.chats ch on ch.id = g.chat_id
    left join public.chat_participants mine on mine.chat_id = g.chat_id and mine.user_id = auth.uid()
    where g.community_id = target_community_id
    order by g.added_at;
end;
$$;

-- ---------------------------------------------------------------- groups in a community
create or replace function public.add_group_to_community(target_community_id uuid, target_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  announcements uuid;
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'Only community admins can add groups';
  end if;
  if not public.is_chat_admin(target_chat_id) then
    raise exception 'You must be an admin of the group to add it to a community';
  end if;
  if not exists (select 1 from public.chats where id = target_chat_id and is_group and not announcement_only) then
    raise exception 'Only ordinary groups can be added to a community';
  end if;
  if exists (select 1 from public.communities where announcement_chat_id = target_chat_id) then
    raise exception 'A community announcements chat cannot be added as a group';
  end if;
  if exists (select 1 from public.community_groups where chat_id = target_chat_id) then
    raise exception 'That group already belongs to a community';
  end if;

  select announcement_chat_id into announcements from public.communities where id = target_community_id;
  insert into public.community_groups (community_id, chat_id, added_by) values (target_community_id, target_chat_id, auth.uid());
  -- Everyone already in the group becomes a member of the community.
  insert into public.chat_participants (chat_id, user_id, role)
  select announcements, p.user_id, 'member' from public.chat_participants p where p.chat_id = target_chat_id
  on conflict (chat_id, user_id) do nothing;
end;
$$;

create or replace function public.remove_group_from_community(target_community_id uuid, target_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'Only community admins can remove groups';
  end if;
  delete from public.community_groups where community_id = target_community_id and chat_id = target_chat_id;
end;
$$;

create or replace function public.create_group_in_community(target_community_id uuid, group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean_name text := trim(coalesce(group_name, ''));
  new_chat uuid := gen_random_uuid();
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'Only community admins can create groups';
  end if;
  if char_length(clean_name) not between 1 and 100 then
    raise exception 'A group name must be 1 to 100 characters';
  end if;
  insert into public.chats (id, is_group, name, created_by) values (new_chat, true, clean_name, me);
  insert into public.chat_participants (chat_id, user_id, role) values (new_chat, me, 'admin');
  insert into public.community_groups (community_id, chat_id, added_by) values (target_community_id, new_chat, me);
  return new_chat;
end;
$$;

create or replace function public.join_community_group(target_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select community_id into target from public.community_groups where chat_id = target_chat_id;
  if target is null then
    raise exception 'That group is not part of a community';
  end if;
  if not public.is_community_member(target) then
    raise exception 'Join the community first';
  end if;
  insert into public.chat_participants (chat_id, user_id, role) values (target_chat_id, auth.uid(), 'member')
  on conflict (chat_id, user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------- invite links
create or replace function public.new_invite_code()
returns text
language sql
volatile
set search_path = public
as $$
  -- 96 random bits from core Postgres (pgcrypto may live in another schema on Supabase).
  select left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 24);
$$;

create or replace function public.community_invite_code(target_community_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing text;
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'Only community admins can manage the invite link';
  end if;
  select code into existing from public.community_invites where community_id = target_community_id;
  if existing is not null then
    return existing;
  end if;
  insert into public.community_invites (community_id, code) values (target_community_id, public.new_invite_code()) returning code into existing;
  return existing;
end;
$$;

-- Replaces the code, which stops the old link working.
create or replace function public.reset_community_invite(target_community_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fresh text := public.new_invite_code();
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'Only community admins can manage the invite link';
  end if;
  insert into public.community_invites (community_id, code) values (target_community_id, fresh)
  on conflict (community_id) do update set code = excluded.code, created_at = now();
  return fresh;
end;
$$;

create or replace function public.preview_community_invite(invite_code text)
returns table (community_id uuid, name text, description text, member_count bigint, group_count bigint, already_member boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return query
    select
      c.id,
      c.name,
      c.description,
      (select count(*) from public.chat_participants p where p.chat_id = c.announcement_chat_id),
      (select count(*) from public.community_groups g where g.community_id = c.id),
      public.is_community_member(c.id)
    from public.community_invites i
    join public.communities c on c.id = i.community_id
    where i.code = invite_code;
end;
$$;

create or replace function public.join_community_by_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  announcements uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select c.id, c.announcement_chat_id into target, announcements
  from public.community_invites i
  join public.communities c on c.id = i.community_id
  where i.code = invite_code;
  if target is null then
    raise exception 'This invite link is invalid or has been reset';
  end if;
  insert into public.chat_participants (chat_id, user_id, role) values (announcements, auth.uid(), 'member')
  on conflict (chat_id, user_id) do nothing;
  return target;
end;
$$;

-- ---------------------------------------------------------------- chat_overview knows about communities
drop function public.chat_overview();
create function public.chat_overview()
returns table (
  chat_id uuid,
  name text,
  is_group boolean,
  avatar_url text,
  is_pinned boolean,
  is_archived boolean,
  is_muted boolean,
  marked_unread boolean,
  peer_id uuid,
  peer_display_name text,
  peer_username text,
  peer_avatar_url text,
  peer_last_seen timestamptz,
  participant_count bigint,
  unread_count bigint,
  last_message jsonb,
  announcement_only boolean,
  can_post boolean,
  community_id uuid,
  community_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.is_group,
    c.avatar_url,
    me.is_pinned,
    me.is_archived,
    me.is_muted and (me.muted_until is null or me.muted_until > now()),
    me.marked_unread,
    peer.id,
    peer.display_name,
    peer.username,
    peer.avatar_url,
    case when peer.show_last_seen then peer.last_seen end,
    (select count(*) from public.chat_participants x where x.chat_id = c.id),
    coalesce(unread.n, 0),
    last_msg.j,
    c.announcement_only,
    (not c.announcement_only) or me.role = 'admin',
    comm.id,
    comm.name
  from public.chat_participants me
  join public.chats c on c.id = me.chat_id
  left join lateral (
    select p.id, p.display_name, p.username, p.avatar_url, p.show_last_seen, p.last_seen
    from public.chat_participants cp
    join public.profiles p on p.id = cp.user_id
    where not c.is_group and cp.chat_id = c.id and cp.user_id <> me.user_id
    limit 1
  ) peer on true
  left join lateral (
    select jsonb_build_object(
      'id', m.id,
      'sender_id', m.sender_id,
      'ciphertext', m.ciphertext,
      'iv', m.iv,
      'wrapped_key', m.encrypted_keys -> (me.user_id::text),
      'created_at', m.created_at,
      'deleted_at', m.deleted_at,
      'message_type', m.message_type,
      'sender_public_key', coalesce(m.sender_public_key, sp.public_key)
    ) as j
    from public.messages m
    left join public.profiles sp on sp.id = m.sender_id
    where m.chat_id = c.id
    order by m.created_at desc
    limit 1
  ) last_msg on true
  left join lateral (
    select count(*) as n
    from public.messages m
    where m.chat_id = c.id
      and m.sender_id <> me.user_id
      and m.deleted_at is null
      and m.created_at > coalesce((select r.created_at from public.messages r where r.id = me.last_read_message_id), '-infinity'::timestamptz)
  ) unread on true
  left join lateral (
    select cm.id, cm.name from public.communities cm where cm.announcement_chat_id = c.id
    union all
    select cm.id, cm.name from public.community_groups cg join public.communities cm on cm.id = cg.community_id where cg.chat_id = c.id
    limit 1
  ) comm on true
  where me.user_id = auth.uid()
  order by me.is_pinned desc, coalesce((last_msg.j ->> 'created_at')::timestamptz, c.created_at) desc;
$$;

-- ---------------------------------------------------------------- realtime and grants
do $$
declare
  target text;
begin
  foreach target in array array['communities', 'community_groups']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;

revoke all on function
  public.is_community_member(uuid, uuid), public.is_community_admin(uuid, uuid), public.can_post_in_chat(uuid),
  public.create_community(text, text, uuid[]), public.update_community(uuid, text, text), public.deactivate_community(uuid),
  public.community_overview(), public.community_groups_overview(uuid), public.add_group_to_community(uuid, uuid),
  public.remove_group_from_community(uuid, uuid), public.create_group_in_community(uuid, text), public.join_community_group(uuid),
  public.new_invite_code(), public.community_invite_code(uuid), public.reset_community_invite(uuid),
  public.preview_community_invite(text), public.join_community_by_code(text), public.chat_overview(),
  public.get_or_create_group_chat(text, uuid[]) from public;
grant execute on function
  public.is_community_member(uuid, uuid), public.is_community_admin(uuid, uuid), public.can_post_in_chat(uuid),
  public.create_community(text, text, uuid[]), public.update_community(uuid, text, text), public.deactivate_community(uuid),
  public.community_overview(), public.community_groups_overview(uuid), public.add_group_to_community(uuid, uuid),
  public.remove_group_from_community(uuid, uuid), public.create_group_in_community(uuid, text), public.join_community_group(uuid),
  public.community_invite_code(uuid), public.reset_community_invite(uuid),
  public.preview_community_invite(text), public.join_community_by_code(text), public.chat_overview(),
  public.get_or_create_group_chat(text, uuid[]) to authenticated;
