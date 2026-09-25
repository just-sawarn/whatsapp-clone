-- Row Level Security and business-rule tests. Runs after every migration, on plain Postgres with the
-- stubs from 00_supabase_stubs.sql. Any failed assertion aborts the run (ON_ERROR_STOP).

create schema test;
grant usage on schema test to public;

create function test.login(uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', uid::text, false);
  set role authenticated;
end $$;

create function test.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- Number of rows a query returns (RLS applies to the current role).
create function test.rows(query text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || query || ') q' into n;
  return n;
end $$;

-- Number of rows a write statement affected; RLS-filtered writes affect 0.
create function test.affected(statement text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end $$;

-- Asserts that a statement raises an error containing `fragment`.
create function test.fails(statement text, fragment text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(lower(fragment) in lower(sqlerrm)) = 0 then
      raise exception 'expected error containing "%" but got "%" for: %', fragment, sqlerrm, statement;
    end if;
    return;
  end;
  raise exception 'expected failure containing "%" but statement succeeded: %', fragment, statement;
end $$;

grant execute on all functions in schema test to public;

-- ------------------------------------------------------------------ fixtures
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com');

insert into public.profiles (id, username, display_name, public_key, discoverable_by) values
  ('00000000-0000-0000-0000-00000000000a', 'alice', 'Alice', 'key-a', 'username'),
  ('00000000-0000-0000-0000-00000000000b', 'bob', 'Bob', 'key-b', 'username'),
  ('00000000-0000-0000-0000-00000000000c', 'carol', 'Carol', 'key-c', 'username_and_email'),
  ('00000000-0000-0000-0000-00000000000d', 'dave', 'Dave', 'key-d', 'nobody');

-- ------------------------------------------------------------------ profile privacy & discovery
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare a constant uuid := '00000000-0000-0000-0000-00000000000a';
begin
  assert test.rows('select 1 from public.profiles') = 1, 'a stranger-free user sees only their own profile';
  assert test.rows($q$select 1 from public.find_profile('@bob')$q$) = 1, 'username discovery works';
  assert test.rows($q$select 1 from public.find_profile('bob')$q$) = 1, 'username without @ works';
  assert test.rows($q$select 1 from public.find_profile('@dave')$q$) = 0, 'discoverable_by=nobody is not findable';
  assert test.rows($q$select 1 from public.find_profile('bob@example.com')$q$) = 0, 'email lookup requires opt-in';
  assert test.rows($q$select 1 from public.find_profile('carol@example.com')$q$) = 1, 'email lookup works when opted in';
  assert test.rows($q$select 1 from public.find_profile('@alice')$q$) = 0, 'you cannot find yourself';
  assert public.username_available('brand_new') is true, 'free username is available';
  assert public.username_available('bob') is false, 'taken username is unavailable';
  assert public.username_available('A') is false, 'invalid username is unavailable';
end $$;
select test.logout();

-- ------------------------------------------------------------------ chat creation & isolation
select test.login('00000000-0000-0000-0000-00000000000a');
create temp table ctx (name text primary key, id uuid);
grant all on ctx to public;
insert into ctx select 'ab', public.get_or_create_direct_chat('00000000-0000-0000-0000-00000000000b');
do $$
declare
  ab uuid := (select id from ctx where name = 'ab');
  again uuid := public.get_or_create_direct_chat('00000000-0000-0000-0000-00000000000b');
begin
  assert ab = again, 'direct chat creation is idempotent';
  assert test.rows('select 1 from public.chat_participants where chat_id = ''' || ab || '''') = 2, 'both people are participants';
  assert test.rows($q$select 1 from public.contacts where contact_id = '00000000-0000-0000-0000-00000000000b'$q$) = 1, 'creator gets the contact';
  assert test.rows('select 1 from public.profiles') = 2, 'a shared chat makes the peer profile visible';
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  assert public.get_or_create_direct_chat('00000000-0000-0000-0000-00000000000a') = ab, 'the other person resolves to the same chat';
end $$;
select test.logout();

-- Carol has no relationship to the alice/bob chat: she must not read or write anything in it.
select test.login('00000000-0000-0000-0000-00000000000c');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  assert test.rows('select 1 from public.chats where id = ''' || ab || '''') = 0, 'outsider cannot see the chat';
  assert test.rows('select 1 from public.chat_participants where chat_id = ''' || ab || '''') = 0, 'outsider cannot see participants';
  assert test.rows('select 1 from public.profiles where id <> auth.uid()') = 0, 'outsider cannot see other profiles';
  perform test.fails(
    format($f$insert into public.chat_participants (chat_id, user_id, role) values (%L, auth.uid(), 'admin')$f$, ab),
    'row-level security');
  perform test.fails(
    format($f$insert into public.messages (chat_id, sender_id, ciphertext, iv, encrypted_keys) values (%L, auth.uid(), 'x', 'y', '{}')$f$, ab),
    'row-level security');
end $$;
select test.logout();

-- ------------------------------------------------------------------ messages, receipts, deletion
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  ab uuid := (select id from ctx where name = 'ab');
  m uuid;
begin
  insert into public.messages (chat_id, sender_id, ciphertext, iv, encrypted_keys, sender_public_key)
  values (ab, auth.uid(), 'cipher-1', 'iv-1', '{"00000000-0000-0000-0000-00000000000b":"wrapped-b"}', 'key-a')
  returning id into m;
  insert into ctx values ('m1', m);
  perform test.fails(
    format($f$update public.messages set ciphertext = 'tampered' where id = %L$f$, m),
    'cannot be changed');
  perform test.fails(
    format($f$update public.messages set is_forwarded = true where id = %L$f$, m),
    'cannot be changed');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare
  ab uuid := (select id from ctx where name = 'ab');
  m uuid := (select id from ctx where name = 'm1');
  overview record;
begin
  assert test.rows('select 1 from public.messages') = 1, 'recipient sees the message';
  assert public.get_or_create_direct_chat('00000000-0000-0000-0000-00000000000a') = ab, 'chat still resolves';

  select * into overview from public.chat_overview() where chat_id = ab;
  assert overview.unread_count = 1, 'recipient has one unread message';
  assert overview.peer_display_name = 'Alice', 'direct chats are named after the peer';
  assert (overview.last_message ->> 'wrapped_key') = 'wrapped-b', 'overview returns only my own wrapped key';

  perform public.mark_messages_delivered();
  assert test.rows(format('select 1 from public.message_status where message_id = %L and status = ''delivered''', m)) = 1, 'delivered receipt recorded';
  perform public.mark_chat_read(ab);
  select * into overview from public.chat_overview() where chat_id = ab;
  assert overview.unread_count = 0, 'reading clears the unread count';
  assert test.rows(format('select 1 from public.message_status where message_id = %L and status = ''read''', m)) = 1, 'read receipt recorded';

  perform test.fails(format($f$update public.messages set deleted_at = now() where id = %L$f$, m), 'only the sender');
  assert test.affected(format($f$update public.message_status set status = 'delivered' where message_id = %L and user_id = auth.uid()$f$, m)) = 1;
  assert (select status from public.message_status where message_id = m and user_id = auth.uid()) = 'read', 'receipts never go backwards';
end $$;
select test.logout();

-- Alice sees Bob's read receipt, unless she has turned her own receipts off (reciprocal rule).
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare m uuid := (select id from ctx where name = 'm1');
begin
  assert test.rows(format('select 1 from public.message_status where message_id = %L and status = ''read''', m)) = 1, 'sender sees the read receipt';
  update public.profiles set show_read_receipts = false where id = auth.uid();
  assert test.rows(format('select 1 from public.message_status where message_id = %L and status = ''read''', m)) = 0, 'read receipts are hidden when I hide mine';
  update public.profiles set show_read_receipts = true where id = auth.uid();
end $$;
select test.logout();

-- Delete for me / for everyone.
select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare m uuid := (select id from ctx where name = 'm1');
begin
  perform public.hide_message_for_me(m);
  assert test.rows('select 1 from public.messages') = 0, 'delete for me hides it from me';
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare m uuid := (select id from ctx where name = 'm1');
begin
  assert test.rows('select 1 from public.messages') = 1, 'delete for me does not affect the sender';
  update public.messages set deleted_at = now(), ciphertext = '', iv = '', encrypted_keys = '{}' where id = m;
  assert (select ciphertext from public.messages where id = m) = '', 'delete for everyone wipes the content';
  perform test.fails(format($f$update public.messages set deleted_at = null where id = %L$f$, m), 'cannot be restored');
end $$;
select test.logout();

-- One-hour window.
set session_replication_role = replica; -- fixtures may bypass the immutability trigger
update public.messages set created_at = now() - interval '2 hours' where id = (select id from ctx where name = 'm1');
set session_replication_role = origin;
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  ab uuid := (select id from ctx where name = 'ab');
  old_message uuid;
begin
  insert into public.messages (chat_id, sender_id, ciphertext, iv, encrypted_keys, created_at)
  values (ab, auth.uid(), 'c2', 'i2', '{}', now() - interval '2 hours') returning id into old_message;
  perform test.fails(format($f$update public.messages set deleted_at = now() where id = %L$f$, old_message), 'within one hour');
end $$;
select test.logout();

-- ------------------------------------------------------------------ blocking
select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  insert into public.contacts (owner_id, contact_id, is_blocked)
  values (auth.uid(), '00000000-0000-0000-0000-00000000000a', true)
  on conflict (owner_id, contact_id) do update set is_blocked = true;
  assert test.rows(format('select 1 from public.messages where chat_id = %L and sender_id <> auth.uid()', ab)) = 0, 'blocked sender messages are hidden';
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  assert public.can_call_in_chat(ab) is false, 'a blocked caller cannot ring';
  perform test.fails(
    format($f$insert into public.calls (chat_id, caller_id, call_type) values (%L, auth.uid(), 'voice')$f$, ab),
    'row-level security');
end $$;
select test.logout();
update public.contacts set is_blocked = false where owner_id = '00000000-0000-0000-0000-00000000000b';

select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  ab uuid := (select id from ctx where name = 'ab');
  call_id uuid;
begin
  insert into public.calls (chat_id, caller_id, call_type) values (ab, auth.uid(), 'video') returning id into call_id;
  update public.calls set status = 'missed' where id = call_id;
  perform test.fails(format($f$update public.calls set status = 'accepted' where id = %L$f$, call_id), 'already finished');
  perform test.fails(format($f$update public.calls set call_type = 'voice' where id = %L$f$, call_id), 'cannot be changed');
end $$;
select test.logout();

-- ------------------------------------------------------------------ groups & participant rules
select test.login('00000000-0000-0000-0000-00000000000a');
insert into ctx select 'g', public.get_or_create_group_chat('Team', array['00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c']::uuid[]);
do $$
declare
  g uuid := (select id from ctx where name = 'g');
  ac uuid;
  ad uuid;
begin
  assert test.rows(format('select 1 from public.chat_participants where chat_id = %L', g)) = 3, 'group has three members';
  perform test.fails(format($f$update public.chat_participants set role = 'member' where chat_id = %L and user_id = auth.uid()$f$, g), 'at least one admin');
  insert into ctx select 'ac', public.get_or_create_direct_chat('00000000-0000-0000-0000-00000000000c');
  select id into ac from ctx where name = 'ac';
  ad := public.get_or_create_direct_chat('00000000-0000-0000-0000-00000000000d');
  perform test.fails(
    format($f$insert into public.chat_participants (chat_id, user_id) values (%L, '00000000-0000-0000-0000-00000000000d')$f$, ac),
    'two participants');
  update public.chat_participants set is_pinned = true where chat_id = g and user_id = auth.uid();
  update public.chat_participants set is_pinned = true where chat_id = ac and user_id = auth.uid();
  update public.chat_participants set is_pinned = true where chat_id = ad and user_id = auth.uid();
  perform test.fails(
    format($f$update public.chat_participants set is_pinned = true where chat_id = %L and user_id = auth.uid()$f$, (select id from ctx where name = 'ab')),
    'pin up to 3');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare g uuid := (select id from ctx where name = 'g');
begin
  perform test.fails(
    format($f$insert into public.chat_participants (chat_id, user_id) values (%L, '00000000-0000-0000-0000-00000000000d')$f$, g),
    'row-level security');
  perform test.fails(
    format($f$update public.chat_participants set role = 'admin' where chat_id = %L and user_id = auth.uid()$f$, g),
    'only a chat admin');
end $$;
select test.logout();

-- The only admin leaves: the longest-standing remaining member is promoted.
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare g uuid := (select id from ctx where name = 'g');
begin
  delete from public.chat_participants where chat_id = g and user_id = auth.uid();
end $$;
select test.logout();
do $$
declare g uuid := (select id from ctx where name = 'g');
begin
  assert (select count(*) from public.chat_participants where chat_id = g and role = 'admin') = 1, 'a successor admin exists';
end $$;

-- Everyone leaves: the chat disappears.
delete from public.chat_participants where chat_id = (select id from ctx where name = 'g');
do $$
begin
  assert not exists (select 1 from public.chats where id = (select id from ctx where name = 'g')), 'empty chats are removed';
end $$;

-- ------------------------------------------------------------------ archive behaviour
select test.login('00000000-0000-0000-0000-00000000000c');
update public.chat_participants set is_archived = true where chat_id = (select id from ctx where name = 'ac') and user_id = auth.uid();
select test.logout();
select test.login('00000000-0000-0000-0000-00000000000a');
insert into public.messages (chat_id, sender_id, ciphertext, iv, encrypted_keys)
values ((select id from ctx where name = 'ac'), auth.uid(), 'c', 'i', '{}');
select test.logout();
do $$
declare ac uuid := (select id from ctx where name = 'ac');
begin
  assert (select is_archived from public.chat_participants where chat_id = ac and user_id = '00000000-0000-0000-0000-00000000000c') = false,
    'a new message un-archives the chat';
  update public.chat_participants set is_archived = true, is_muted = true where chat_id = ac and user_id = '00000000-0000-0000-0000-00000000000c';
  insert into public.messages (chat_id, sender_id, ciphertext, iv, encrypted_keys) values (ac, '00000000-0000-0000-0000-00000000000a', 'c', 'i', '{}');
  assert (select is_archived from public.chat_participants where chat_id = ac and user_id = '00000000-0000-0000-0000-00000000000c') = true,
    'muted chats stay archived';
end $$;

-- ------------------------------------------------------------------ statuses
-- A status is visible only when both people have each other as non-blocked contacts.
-- Alice -> Carol exists (Alice created the chat); Carol -> Alice appears once Carol replies.
insert into public.statuses (user_id, caption) values ('00000000-0000-0000-0000-00000000000a', 'hello');

select test.login('00000000-0000-0000-0000-00000000000c');
do $$
declare ac uuid := (select id from ctx where name = 'ac');
begin
  assert test.rows('select 1 from public.statuses') = 0, 'one-sided contacts do not expose statuses';
  insert into public.messages (chat_id, sender_id, ciphertext, iv, encrypted_keys) values (ac, auth.uid(), 'c', 'i', '{}');
  assert test.rows('select 1 from public.statuses') = 1, 'replying makes the relationship mutual';
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000d');
do $$ begin assert test.rows('select 1 from public.statuses') = 0, 'a stranger cannot see statuses'; end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare s uuid := (select id from public.statuses limit 1);
begin
  assert test.rows('select 1 from public.statuses') = 1, 'bob is a mutual contact';
  insert into public.status_views (status_id, viewer_id) values (s, auth.uid());
  assert test.rows('select 1 from public.status_views') = 1, 'viewers can see their own views';
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000a');
do $$ begin assert test.rows('select 1 from public.status_views') = 1, 'the poster sees who viewed'; end $$;
update public.contacts set is_blocked = true where owner_id = auth.uid() and contact_id = '00000000-0000-0000-0000-00000000000c';
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000c');
do $$ begin assert test.rows('select 1 from public.statuses') = 0, 'blocking hides statuses'; end $$;
select test.logout();

-- ------------------------------------------------------------------ storage
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  insert into storage.objects (bucket_id, name) values ('chat-media', ab || '/00000000-0000-0000-0000-00000000000a/file1');
  perform test.fails(
    format($f$insert into storage.objects (bucket_id, name) values ('chat-media', %L)$f$, ab || '/00000000-0000-0000-0000-00000000000b/file2'),
    'row-level security');
  insert into storage.objects (bucket_id, name) values ('status-media', '00000000-0000-0000-0000-00000000000a/story1');
  insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000a/me.png');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  assert test.rows(format('select 1 from storage.objects where bucket_id = ''chat-media'' and name like %L', ab || '/%')) = 1, 'chat members can read chat media';
  assert test.rows('select 1 from storage.objects where bucket_id = ''status-media''') = 1, 'mutual contacts can read status media';
  assert test.rows('select 1 from storage.objects where bucket_id = ''avatars''') = 1, 'avatars are visible with the default setting';
  perform test.fails(
    $f$insert into storage.objects (bucket_id, name) values ('status-media', '00000000-0000-0000-0000-00000000000a/forged')$f$,
    'row-level security');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000c');
do $$
begin
  assert test.rows('select 1 from storage.objects where bucket_id = ''chat-media''') = 0, 'outsiders cannot read chat media';
  perform test.fails(
    format($f$insert into storage.objects (bucket_id, name) values ('chat-media', %L)$f$, (select id from ctx where name = 'ab') || '/00000000-0000-0000-0000-00000000000c/x'),
    'row-level security');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000a');
update public.profiles set show_profile_photo = 'nobody' where id = auth.uid();
do $$ begin assert test.rows('select 1 from storage.objects where bucket_id = ''avatars''') = 1, 'owners always see their own photo'; end $$;
select test.logout();
select test.login('00000000-0000-0000-0000-00000000000b');
do $$ begin assert test.rows('select 1 from storage.objects where bucket_id = ''avatars''') = 0, 'show_profile_photo = nobody hides the photo'; end $$;
select test.logout();

-- ------------------------------------------------------------------ realtime
do $$
begin
  assert (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') >= 8,
    'realtime publication covers the live tables';
end $$;

-- ------------------------------------------------------------------ message_view
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  assert test.rows(format('select 1 from public.message_view where chat_id = %L', ab)) >= 1, 'members can read the view';
end $$;
select test.logout();
select test.login('00000000-0000-0000-0000-00000000000c');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  assert test.rows(format('select 1 from public.message_view where chat_id = %L', ab)) = 0, 'the view does not leak other chats';
end $$;
select test.logout();

-- ------------------------------------------------------------------ clear chat for me
select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  perform public.clear_chat_for_me(ab);
  assert test.rows(format('select 1 from public.messages where chat_id = %L', ab)) = 0, 'clearing hides every message for me';
  assert test.rows(format('select 1 from public.chat_participants where chat_id = %L', ab)) = 2, 'clearing keeps the chat and its members';
end $$;
select test.logout();
select test.login('00000000-0000-0000-0000-00000000000c');
do $$
declare ab uuid := (select id from ctx where name = 'ab');
begin
  perform public.clear_chat_for_me(ab);
  assert (select count(*) from public.messages where chat_id = ab and hidden_for @> array['00000000-0000-0000-0000-00000000000c'::uuid]) = 0,
    'an outsider cannot clear someone else''s chat';
end $$;
select test.logout();
