-- Enable Realtime for messages (subscribeToChat depends on it).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- A chat's creator may add themselves as the first participant. Security definer because
-- the creator is not yet a member, so RLS would hide the chat row from a plain subquery.
create or replace function public.is_chat_bootstrap(target_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.chats where id = target_chat_id and created_by = auth.uid())
    and not exists (select 1 from public.chat_participants where chat_id = target_chat_id);
$$;

-- Previously any user could insert themselves into any chat, with any role.
drop policy participants_insert_admin_or_self on public.chat_participants;
create policy participants_insert_admin_or_bootstrap on public.chat_participants for insert to authenticated
  with check (
    public.is_chat_admin(chat_id)
    or (user_id = auth.uid() and role = 'admin' and public.is_chat_bootstrap(chat_id))
  );

create or replace function public.enforce_participant_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Direct chats hold exactly two people.
    if exists (select 1 from public.chats where id = new.chat_id and not is_group)
      and (select count(*) from public.chat_participants where chat_id = new.chat_id) >= 2 then
      raise exception 'A direct chat can only have two participants';
    end if;
  elsif new.role <> old.role or new.chat_id <> old.chat_id or new.user_id <> old.user_id then
    -- Members could previously promote themselves through the self-update policy.
    if new.chat_id <> old.chat_id or new.user_id <> old.user_id or not public.is_chat_admin(old.chat_id) then
      raise exception 'Only a chat admin can change roles';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_participant_rules_before_write
before insert or update on public.chat_participants
for each row execute function public.enforce_participant_rules();

-- Extend the message update guard to the remaining fields a member should not touch.
create or replace function public.enforce_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ciphertext <> old.ciphertext
    or new.iv <> old.iv
    or new.encrypted_keys <> old.encrypted_keys
    or new.chat_id <> old.chat_id
    or new.sender_id <> old.sender_id
    or new.message_type <> old.message_type
    or new.media_path is distinct from old.media_path
    or new.reply_to_id is distinct from old.reply_to_id
    or new.is_forwarded <> old.is_forwarded
    or new.forward_origin_chat_id is distinct from old.forward_origin_chat_id
    or new.duration_seconds is distinct from old.duration_seconds
    or new.edited_at is distinct from old.edited_at
    or new.created_at <> old.created_at then
    raise exception 'Message content and ownership cannot be changed';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if auth.uid() <> old.sender_id or old.created_at < now() - interval '1 hour' then
      raise exception 'Only the sender can delete a message within one hour';
    end if;
  end if;

  if new.hidden_for <> old.hidden_for then
    if not public.is_chat_member(old.chat_id) or not (auth.uid() = any(new.hidden_for)) then
      raise exception 'Only a participant can hide a message for themselves';
    end if;
  end if;

  return new;
end;
$$;
