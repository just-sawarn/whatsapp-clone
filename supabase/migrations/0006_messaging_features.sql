-- Messaging features: per-message sender key, block handling, delivery/read receipts, chat overview,
-- participant rules (pin cap, group size, admin hand-over), and realtime for the new tables.

alter table public.messages add column sender_public_key text;
alter table public.chat_participants add column marked_unread boolean not null default false;
create index message_status_user_idx on public.message_status (user_id, message_id);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_blocked_by_me(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.contacts
    where owner_id = auth.uid() and contact_id = target_user_id and is_blocked
  );
$$;

create or replace function public.i_show_read_receipts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select show_read_receipts from public.profiles where id = auth.uid()), true);
$$;

-- ---------------------------------------------------------------- messages
-- Messages from people you blocked are hidden from you. The sender is not told.
drop policy messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated
  using (
    public.is_chat_member(chat_id)
    and not (auth.uid() = any (hidden_for))
    and (sender_id = auth.uid() or not public.is_blocked_by_me(sender_id))
  );

-- Content is immutable, except that "delete for everyone" may wipe it. Deletion is one-way, sender-only
-- and limited to one hour.
create or replace function public.enforce_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deleting boolean := old.deleted_at is null and new.deleted_at is not null;
begin
  if new.chat_id <> old.chat_id
    or new.sender_id <> old.sender_id
    or new.created_at <> old.created_at
    or new.message_type <> old.message_type
    or new.reply_to_id is distinct from old.reply_to_id
    or new.is_forwarded <> old.is_forwarded
    or new.forward_origin_chat_id is distinct from old.forward_origin_chat_id
    or new.duration_seconds is distinct from old.duration_seconds
    or new.edited_at is distinct from old.edited_at
    or new.sender_public_key is distinct from old.sender_public_key then
    raise exception 'Message content and ownership cannot be changed';
  end if;

  if not deleting and (
    new.ciphertext <> old.ciphertext
    or new.iv <> old.iv
    or new.encrypted_keys <> old.encrypted_keys
    or new.media_path is distinct from old.media_path
  ) then
    raise exception 'Message content and ownership cannot be changed';
  end if;

  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'A deleted message cannot be restored';
  end if;

  if deleting and (auth.uid() <> old.sender_id or old.created_at < now() - interval '1 hour') then
    raise exception 'Only the sender can delete a message within one hour';
  end if;

  if new.hidden_for <> old.hidden_for then
    if not public.is_chat_member(old.chat_id) or not (auth.uid() = any (new.hidden_for)) then
      raise exception 'Only a participant can hide a message for themselves';
    end if;
  end if;

  return new;
end;
$$;

-- Replying in a direct chat makes the conversation mutual: the sender records the other person as a contact.
create or replace function public.after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contacts (owner_id, contact_id)
  select new.sender_id, cp.user_id
  from public.chat_participants cp
  join public.chats c on c.id = cp.chat_id and not c.is_group
  where cp.chat_id = new.chat_id and cp.user_id <> new.sender_id
  on conflict (owner_id, contact_id) do nothing;

  -- A new message brings an archived (and not muted) chat back to the main list.
  update public.chat_participants
  set is_archived = false
  where chat_id = new.chat_id and user_id <> new.sender_id and is_archived and not is_muted;

  return new;
end;
$$;

create trigger messages_after_insert after insert on public.messages
for each row execute function public.after_message_insert();

-- ---------------------------------------------------------------- receipts
drop policy message_status_select_member on public.message_status;
create policy message_status_select_member on public.message_status for select to authenticated
  using (
    exists (select 1 from public.messages m where m.id = message_id and public.is_chat_member(m.chat_id))
    and (user_id = auth.uid() or status <> 'read' or public.i_show_read_receipts())
  );

create or replace function public.message_status_rank(value text)
returns int
language sql
immutable
as $$ select case value when 'read' then 3 when 'delivered' then 2 else 1 end $$;

create or replace function public.keep_status_monotonic()
returns trigger
language plpgsql
as $$
begin
  if public.message_status_rank(new.status) < public.message_status_rank(old.status) then
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger message_status_monotonic before update on public.message_status
for each row execute function public.keep_status_monotonic();

create or replace function public.mark_chat_read(target_chat_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  newest uuid;
  receipt text;
begin
  if not public.is_chat_member(target_chat_id) then
    raise exception 'Not a member of this chat';
  end if;
  select id into newest from public.messages where chat_id = target_chat_id order by created_at desc limit 1;
  receipt := case when public.i_show_read_receipts() then 'read' else 'delivered' end;

  insert into public.message_status (message_id, user_id, status)
  select m.id, auth.uid(), receipt
  from public.messages m
  where m.chat_id = target_chat_id and m.sender_id <> auth.uid()
  on conflict (message_id, user_id) do update
    set status = excluded.status, updated_at = now()
    where public.message_status_rank(excluded.status) > public.message_status_rank(public.message_status.status);

  update public.chat_participants
  set last_read_message_id = coalesce(newest, last_read_message_id), marked_unread = false
  where chat_id = target_chat_id and user_id = auth.uid();
end;
$$;

create or replace function public.mark_messages_delivered()
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.message_status (message_id, user_id, status)
  select m.id, auth.uid(), 'delivered'
  from public.messages m
  join public.chat_participants cp on cp.chat_id = m.chat_id and cp.user_id = auth.uid()
  where m.sender_id <> auth.uid() and m.created_at > now() - interval '30 days'
  on conflict (message_id, user_id) do nothing;
$$;

-- Security definer on purpose: an UPDATE must leave the row visible under the SELECT policy, and a message
-- hidden for the caller is by definition no longer visible to them, so a plain client UPDATE would be refused.
create or replace function public.hide_message_for_me(target_message_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
  set hidden_for = array_append(hidden_for, auth.uid())
  where id = target_message_id
    and public.is_chat_member(chat_id)
    and not (auth.uid() = any (hidden_for));
$$;

-- ---------------------------------------------------------------- participants
create or replace function public.enforce_participant_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bypass boolean := coalesce(current_setting('app.bypass_participant_rules', true), '') = '1';
  member_count int;
begin
  if tg_op = 'INSERT' then
    -- BEFORE triggers run ahead of RLS; leave callers who could not insert anyway to the policy so
    -- these rules never reveal anything about a chat the caller has no access to.
    if auth.uid() is not null and not (public.is_chat_admin(new.chat_id) or public.is_chat_bootstrap(new.chat_id)) then
      return new;
    end if;
    select count(*) into member_count from public.chat_participants where chat_id = new.chat_id;
    if exists (select 1 from public.chats where id = new.chat_id and not is_group) and member_count >= 2 then
      raise exception 'A direct chat can only have two participants';
    end if;
    if member_count >= 256 then
      raise exception 'A group can have at most 256 participants';
    end if;
    return new;
  end if;

  if new.chat_id <> old.chat_id or new.user_id <> old.user_id then
    raise exception 'Participant identity cannot be changed';
  end if;

  if new.role <> old.role and not bypass then
    if not public.is_chat_admin(old.chat_id) then
      raise exception 'Only a chat admin can change roles';
    end if;
    if old.role = 'admin' and not exists (
      select 1 from public.chat_participants
      where chat_id = old.chat_id and role = 'admin' and user_id <> old.user_id
    ) then
      raise exception 'A group needs at least one admin';
    end if;
  end if;

  if new.is_pinned and not old.is_pinned
    and (select count(*) from public.chat_participants where user_id = new.user_id and is_pinned) >= 3 then
    raise exception 'You can pin up to 3 chats';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_participant_rules_before_write on public.chat_participants;
create trigger enforce_participant_rules_before_write
before insert or update on public.chat_participants
for each row execute function public.enforce_participant_rules();

-- When someone leaves: delete the chat once empty, and hand admin to the longest-standing member if none is left.
create or replace function public.handle_participant_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  successor uuid;
begin
  if not exists (select 1 from public.chats where id = old.chat_id) then
    return old; -- the chat itself is being deleted
  end if;
  if not exists (select 1 from public.chat_participants where chat_id = old.chat_id) then
    delete from public.chats where id = old.chat_id;
    return old;
  end if;
  if exists (select 1 from public.chats where id = old.chat_id and is_group)
    and not exists (select 1 from public.chat_participants where chat_id = old.chat_id and role = 'admin') then
    select user_id into successor from public.chat_participants where chat_id = old.chat_id order by joined_at, user_id limit 1;
    perform set_config('app.bypass_participant_rules', '1', true);
    update public.chat_participants set role = 'admin' where chat_id = old.chat_id and user_id = successor;
    perform set_config('app.bypass_participant_rules', '0', true);
  end if;
  return old;
end;
$$;

create trigger participants_after_delete after delete on public.chat_participants
for each row execute function public.handle_participant_leave();

-- ---------------------------------------------------------------- chat creation adds the contact
create or replace function public.get_or_create_direct_chat(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_chat_id uuid;
  new_chat_id uuid := gen_random_uuid();
begin
  if current_user_id is null or other_user_id is null or current_user_id = other_user_id then
    raise exception 'Invalid direct chat participants';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'That user does not exist';
  end if;

  -- Serialise concurrent creations for the same pair so two tabs cannot create two chats.
  perform pg_advisory_xact_lock(hashtextextended(least(current_user_id, other_user_id)::text || greatest(current_user_id, other_user_id)::text, 0));

  select cp.chat_id into existing_chat_id
  from public.chat_participants cp
  join public.chats c on c.id = cp.chat_id
  where cp.user_id = current_user_id
    and c.is_group = false
    and (select count(*) from public.chat_participants members where members.chat_id = cp.chat_id) = 2
    and exists (select 1 from public.chat_participants other_member where other_member.chat_id = cp.chat_id and other_member.user_id = other_user_id)
  limit 1;

  insert into public.contacts (owner_id, contact_id) values (current_user_id, other_user_id)
  on conflict (owner_id, contact_id) do nothing;

  if existing_chat_id is not null then
    return existing_chat_id;
  end if;

  insert into public.chats (id, is_group, created_by) values (new_chat_id, false, current_user_id);
  insert into public.chat_participants (chat_id, user_id, role)
  values (new_chat_id, current_user_id, 'admin'), (new_chat_id, other_user_id, 'member');
  return new_chat_id;
end;
$$;

-- 0003's version failed at runtime ("column reference member_id is ambiguous"), so groups could not be created.
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

-- ---------------------------------------------------------------- chat overview
create or replace function public.chat_overview()
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
  last_message jsonb
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
    last_msg.j
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
  where me.user_id = auth.uid()
  order by me.is_pinned desc, coalesce((last_msg.j ->> 'created_at')::timestamptz, c.created_at) desc;
$$;

-- ---------------------------------------------------------------- calls
create or replace function public.can_call_in_chat(target_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_chat_member(target_chat_id)
    and exists (select 1 from public.chats where id = target_chat_id and not is_group)
    and not exists (
      select 1
      from public.chat_participants cp
      join public.contacts k on k.owner_id = cp.user_id and k.contact_id = auth.uid() and k.is_blocked
      where cp.chat_id = target_chat_id and cp.user_id <> auth.uid()
    );
$$;

drop policy calls_insert_caller on public.calls;
create policy calls_insert_caller on public.calls for insert to authenticated
  with check (caller_id = auth.uid() and public.can_call_in_chat(chat_id));

create or replace function public.enforce_call_update()
returns trigger
language plpgsql
as $$
begin
  if new.chat_id <> old.chat_id or new.caller_id <> old.caller_id or new.call_type <> old.call_type or new.started_at <> old.started_at then
    raise exception 'Call identity cannot be changed';
  end if;
  if old.status in ('declined', 'missed', 'ended') and new.status <> old.status then
    raise exception 'This call has already finished';
  end if;
  return new;
end;
$$;

create trigger calls_before_update before update on public.calls
for each row execute function public.enforce_call_update();

-- ---------------------------------------------------------------- realtime
do $$
declare
  target text;
begin
  foreach target in array array['messages', 'message_status', 'message_reactions', 'chat_participants', 'chats', 'calls', 'statuses', 'status_views']
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
  public.is_blocked_by_me(uuid), public.i_show_read_receipts(), public.mark_chat_read(uuid),
  public.mark_messages_delivered(), public.hide_message_for_me(uuid), public.chat_overview(),
  public.can_call_in_chat(uuid) from public;
grant execute on function
  public.is_blocked_by_me(uuid), public.i_show_read_receipts(), public.mark_chat_read(uuid),
  public.mark_messages_delivered(), public.hide_message_for_me(uuid), public.chat_overview(),
  public.can_call_in_chat(uuid) to authenticated;

revoke all on function public.get_or_create_direct_chat(uuid), public.get_or_create_group_chat(text, uuid[]) from public;
grant execute on function public.get_or_create_direct_chat(uuid), public.get_or_create_group_chat(text, uuid[]) to authenticated;
