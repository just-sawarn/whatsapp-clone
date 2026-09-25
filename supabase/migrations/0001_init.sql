create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  about text default 'Hey there! I am using WhatsApp clone.',
  public_key text not null,
  last_seen timestamptz,
  is_online boolean not null default false,
  show_last_seen boolean not null default true,
  show_read_receipts boolean not null default true,
  show_profile_photo text not null default 'everyone' check (show_profile_photo in ('everyone', 'contacts', 'nobody')),
  discoverable_by text not null default 'username' check (discoverable_by in ('username', 'username_and_email', 'nobody')),
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, contact_id),
  check (owner_id <> contact_id)
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((is_group and name is not null and char_length(name) between 1 and 100) or (not is_group and name is null))
);

create table public.chat_participants (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  last_read_message_id uuid,
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  is_muted boolean not null default false,
  muted_until timestamptz,
  primary key (chat_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  encrypted_keys jsonb not null,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file', 'audio')),
  media_path text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  reply_to_id uuid references public.messages(id) on delete set null,
  is_forwarded boolean not null default false,
  forward_origin_chat_id uuid,
  hidden_for uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.message_status (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.starred_messages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_path text,
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (media_path is not null or caption is not null)
);

create table public.status_views (
  status_id uuid not null references public.statuses(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  call_type text not null check (call_type in ('voice', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'ended', 'missed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.call_participants (
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  primary key (call_id, user_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index messages_chat_created_idx on public.messages (chat_id, created_at desc);
create index chat_participants_user_idx on public.chat_participants (user_id, chat_id);
create index statuses_user_expiry_idx on public.statuses (user_id, expires_at desc);
create index calls_chat_started_idx on public.calls (chat_id, started_at desc);

create or replace function public.is_chat_member(target_chat_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_participants
    where chat_id = target_chat_id and user_id = target_user_id
  );
$$;

create or replace function public.is_chat_admin(target_chat_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_participants
    where chat_id = target_chat_id and user_id = target_user_id and role = 'admin'
  );
$$;

create or replace function public.can_view_status(target_status_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_status_user_id = auth.uid()
    or exists (
      select 1 from public.contacts
      where owner_id = auth.uid() and contact_id = target_status_user_id and is_blocked = false
    );
$$;

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

create trigger enforce_message_update_before_update
before update on public.messages
for each row execute function public.enforce_message_update();

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_status enable row level security;
alter table public.message_reactions enable row level security;
alter table public.starred_messages enable row level security;
alter table public.statuses enable row level security;
alter table public.status_views enable row level security;
alter table public.calls enable row level security;
alter table public.call_participants enable row level security;
alter table public.push_subscriptions enable row level security;

create policy profiles_select_authenticated on public.profiles for select to authenticated using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_own on public.profiles for delete to authenticated using (id = auth.uid());

create policy contacts_select_own on public.contacts for select to authenticated using (owner_id = auth.uid());
create policy contacts_insert_own on public.contacts for insert to authenticated with check (owner_id = auth.uid());
create policy contacts_update_own on public.contacts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy contacts_delete_own on public.contacts for delete to authenticated using (owner_id = auth.uid());

create policy chats_select_member on public.chats for select to authenticated using (public.is_chat_member(id));
create policy chats_insert_authenticated on public.chats for insert to authenticated with check (created_by = auth.uid());
create policy chats_update_admin on public.chats for update to authenticated using (public.is_chat_admin(id)) with check (public.is_chat_admin(id));
create policy chats_delete_creator on public.chats for delete to authenticated using (created_by = auth.uid());

create policy participants_select_member on public.chat_participants for select to authenticated using (public.is_chat_member(chat_id));
create policy participants_insert_admin_or_self on public.chat_participants for insert to authenticated with check (user_id = auth.uid() or public.is_chat_admin(chat_id));
create policy participants_update_self_or_admin on public.chat_participants for update to authenticated using (user_id = auth.uid() or public.is_chat_admin(chat_id)) with check (user_id = auth.uid() or public.is_chat_admin(chat_id));
create policy participants_delete_self_or_admin on public.chat_participants for delete to authenticated using (user_id = auth.uid() or public.is_chat_admin(chat_id));

create policy messages_select_member on public.messages for select to authenticated using (public.is_chat_member(chat_id) and not (auth.uid() = any(hidden_for)));
create policy messages_insert_member_sender on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_chat_member(chat_id));
create policy messages_update_member on public.messages for update to authenticated using (public.is_chat_member(chat_id)) with check (public.is_chat_member(chat_id));
create policy messages_delete_sender on public.messages for delete to authenticated using (sender_id = auth.uid() and created_at >= now() - interval '1 hour');

create policy message_status_select_member on public.message_status for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id and public.is_chat_member(m.chat_id)));
create policy message_status_insert_own on public.message_status for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.is_chat_member(m.chat_id)));
create policy message_status_update_own on public.message_status for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reactions_select_member on public.message_reactions for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id and public.is_chat_member(m.chat_id)));
create policy reactions_insert_own on public.message_reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.is_chat_member(m.chat_id)));
create policy reactions_update_own on public.message_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reactions_delete_own on public.message_reactions for delete to authenticated using (user_id = auth.uid());

create policy stars_select_own on public.starred_messages for select to authenticated using (user_id = auth.uid());
create policy stars_insert_own on public.starred_messages for insert to authenticated with check (user_id = auth.uid());
create policy stars_delete_own on public.starred_messages for delete to authenticated using (user_id = auth.uid());

create policy statuses_select_allowed on public.statuses for select to authenticated using (expires_at > now() and public.can_view_status(user_id));
create policy statuses_insert_own on public.statuses for insert to authenticated with check (user_id = auth.uid());
create policy statuses_update_own on public.statuses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy statuses_delete_own on public.statuses for delete to authenticated using (user_id = auth.uid());

create policy status_views_select_poster on public.status_views for select to authenticated using (exists (select 1 from public.statuses s where s.id = status_id and s.user_id = auth.uid()));
create policy status_views_insert_own on public.status_views for insert to authenticated with check (viewer_id = auth.uid() and exists (select 1 from public.statuses s where s.id = status_id and public.can_view_status(s.user_id)));
create policy status_views_delete_own on public.status_views for delete to authenticated using (viewer_id = auth.uid());

create policy calls_select_member on public.calls for select to authenticated using (public.is_chat_member(chat_id));
create policy calls_insert_caller on public.calls for insert to authenticated with check (caller_id = auth.uid() and public.is_chat_member(chat_id));
create policy calls_update_member on public.calls for update to authenticated using (public.is_chat_member(chat_id)) with check (public.is_chat_member(chat_id));

create policy call_participants_select_member on public.call_participants for select to authenticated using (exists (select 1 from public.calls c where c.id = call_id and public.is_chat_member(c.chat_id)));
create policy call_participants_insert_self on public.call_participants for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.calls c where c.id = call_id and public.is_chat_member(c.chat_id)));
create policy call_participants_update_self on public.call_participants for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
