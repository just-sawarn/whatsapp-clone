-- Communities: posting rules, linking, joining, invites and cascades. Runs after 10_policies.sql, which
-- created the test helpers (test.login, test.rows, test.fails, ...) and the users alice..dave.

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e', 'erin@example.com');
insert into public.profiles (id, username, display_name, public_key)
values ('00000000-0000-0000-0000-00000000000e', 'erin', 'Erin', 'key-e');

create temp table cx (name text primary key, id uuid);
grant all on cx to public;

-- ------------------------------------------------------------------ creating a community
select test.login('00000000-0000-0000-0000-00000000000a');
insert into cx select 'community', public.create_community('Neighbourhood', 'Everything for the street', array['00000000-0000-0000-0000-00000000000b']::uuid[]);
insert into cx select 'announcements', announcement_chat_id from public.communities where id = (select id from cx where name = 'community');
do $$
declare cid uuid := (select id from cx where name = 'community');
begin
  assert (select count(*) from public.community_overview()) = 1, 'the creator sees the community';
  assert (select my_role from public.community_overview()) = 'admin', 'the creator is an admin';
  assert (select member_count from public.community_overview()) = 2, 'members were added';
  perform test.fails($f$select public.create_community('', '', '{}')$f$, 'name must be');
  perform test.fails($f$select public.create_community('x', repeat('d', 501), '{}')$f$, 'at most 500');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000b');
do $$ begin assert (select my_role from public.community_overview()) = 'member', 'the invited person is a member'; end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000c');
do $$
declare cid uuid := (select id from cx where name = 'community');
begin
  assert (select count(*) from public.community_overview()) = 0, 'outsiders do not see the community';
  assert test.rows('select 1 from public.communities') = 0, 'outsiders cannot read community rows';
  perform test.fails(format($f$select * from public.community_groups_overview(%L)$f$, cid), 'not a member');
end $$;
select test.logout();

-- ------------------------------------------------------------------ announcements: admins only
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare a uuid := (select id from cx where name = 'announcements');
begin
  insert into public.messages (chat_id, sender_id, ciphertext, iv, encrypted_keys) values (a, auth.uid(), 'c', 'i', '{}');
  assert (select can_post from public.chat_overview() where chat_id = a) = true, 'an admin can post';
  assert (select community_name from public.chat_overview() where chat_id = a) = 'Neighbourhood', 'the chat knows its community';
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare a uuid := (select id from cx where name = 'announcements');
begin
  assert test.rows(format('select 1 from public.messages where chat_id = %L', a)) = 1, 'members can read announcements';
  assert (select can_post from public.chat_overview() where chat_id = a) = false, 'a member cannot post';
  perform test.fails(
    format($f$insert into public.messages (chat_id, sender_id, ciphertext, iv, encrypted_keys) values (%L, auth.uid(), 'c', 'i', '{}')$f$, a),
    'row-level security');
end $$;
select test.logout();

-- ------------------------------------------------------------------ groups in a community
select test.login('00000000-0000-0000-0000-00000000000a');
insert into cx select 'general', public.create_group_in_community((select id from cx where name = 'community'), 'General');
insert into cx select 'existing', public.get_or_create_group_chat('Existing', array['00000000-0000-0000-0000-00000000000d']::uuid[]);
do $$
declare
  cid uuid := (select id from cx where name = 'community');
  existing uuid := (select id from cx where name = 'existing');
  a uuid := (select id from cx where name = 'announcements');
begin
  perform public.add_group_to_community(cid, existing);
  assert (select group_count from public.community_overview()) = 2, 'both groups are linked';
  assert exists (select 1 from public.chat_participants where chat_id = a and user_id = '00000000-0000-0000-0000-00000000000d'),
    'people already in a linked group become community members';
  perform test.fails(format($f$select public.add_group_to_community(%L, %L)$f$, cid, existing), 'already belongs');
  perform test.fails(format($f$select public.add_group_to_community(%L, %L)$f$, cid, a), 'ordinary groups');
  assert (select community_name from public.chat_overview() where chat_id = existing) = 'Neighbourhood', 'linked groups know their community';
end $$;
select test.logout();

-- A second community cannot take the same group, and a group needs its own admin.
select test.login('00000000-0000-0000-0000-00000000000c');
insert into cx select 'other', public.create_community('Other place', '', '{}');
insert into cx select 'carols', public.get_or_create_group_chat('Book club', array['00000000-0000-0000-0000-00000000000d']::uuid[]);
do $$
declare
  other uuid := (select id from cx where name = 'other');
  existing uuid := (select id from cx where name = 'existing');
begin
  perform test.fails(format($f$select public.add_group_to_community(%L, %L)$f$, other, existing), 'admin of the group');
  perform public.add_group_to_community(other, (select id from cx where name = 'carols'));
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare cid uuid := (select id from cx where name = 'community');
begin
  perform test.fails(format($f$select public.add_group_to_community(%L, %L)$f$, cid, (select id from cx where name = 'carols')), 'admin of the group');
end $$;
select test.logout();

-- ------------------------------------------------------------------ members: see groups and join them
select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare
  cid uuid := (select id from cx where name = 'community');
  general uuid := (select id from cx where name = 'general');
  existing uuid := (select id from cx where name = 'existing');
begin
  assert (select count(*) from public.community_groups_overview(cid)) = 2, 'a member sees every group';
  assert (select is_member from public.community_groups_overview(cid) where chat_id = general) = false, 'not yet joined';
  assert test.rows(format('select 1 from public.chats where id = %L', general)) = 0, 'an unjoined group stays private (no direct read)';

  perform public.join_community_group(general);
  assert (select is_member from public.community_groups_overview(cid) where chat_id = general) = true, 'joined';
  assert test.rows(format('select 1 from public.chat_participants where chat_id = %L', general)) >= 2, 'now visible';

  perform test.fails(format($f$select public.add_group_to_community(%L, %L)$f$, cid, existing), 'Only community admins');
  perform test.fails(format($f$select public.create_group_in_community(%L, 'Sneaky')$f$, cid), 'Only community admins');
  perform test.fails(format($f$select public.remove_group_from_community(%L, %L)$f$, cid, general), 'Only community admins');
  perform test.fails(format($f$select public.update_community(%L, 'Renamed', '')$f$, cid), 'Only community admins');
  perform test.fails(format($f$select public.deactivate_community(%L)$f$, cid), 'Only community admins');
  perform test.fails(format($f$select public.community_invite_code(%L)$f$, cid), 'Only community admins');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000c');
do $$
declare general uuid := (select id from cx where name = 'general');
begin
  perform test.fails(format($f$select public.join_community_group(%L)$f$, general), 'Join the community first');
  perform test.fails(format($f$select public.join_community_group(%L)$f$, (select id from cx where name = 'announcements')), 'not part of a community');
end $$;
select test.logout();

-- ------------------------------------------------------------------ invite links
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  cid uuid := (select id from cx where name = 'community');
  code text := public.community_invite_code(cid);
begin
  assert char_length(code) = 24, 'a code is issued';
  assert public.community_invite_code(cid) = code, 'the same code is returned until it is reset';
  insert into cx values ('code1', null);
  perform set_config('test.code1', code, false);
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000e');
do $$
declare code text := current_setting('test.code1');
begin
  assert (select name from public.preview_community_invite(code)) = 'Neighbourhood', 'anyone signed in can preview an invite';
  assert (select already_member from public.preview_community_invite(code)) = false;
  assert (select count(*) from public.preview_community_invite('does-not-exist')) = 0, 'unknown codes preview as nothing';
  perform public.join_community_by_code(code);
  assert (select count(*) from public.community_overview()) = 1, 'the invitee joined';
  assert (select my_role from public.community_overview()) = 'member';
  perform public.join_community_by_code(code); -- joining twice is harmless
  perform test.fails($f$select public.join_community_by_code('nope')$f$, 'invalid');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  cid uuid := (select id from cx where name = 'community');
  old_code text := current_setting('test.code1');
  fresh text := public.reset_community_invite(cid);
begin
  assert fresh <> old_code, 'resetting issues a different code';
  assert public.community_invite_code(cid) = fresh, 'and that is the code from now on';
end $$;
select test.logout();
select test.login('00000000-0000-0000-0000-00000000000c');
do $$ begin perform test.fails(format($f$select public.join_community_by_code(%L)$f$, current_setting('test.code1')), 'invalid'); end $$;
select test.logout();

-- ------------------------------------------------------------------ leaving and removal cascade to the groups
select test.login('00000000-0000-0000-0000-00000000000e');
do $$
declare
  general uuid := (select id from cx where name = 'general');
  a uuid := (select id from cx where name = 'announcements');
begin
  perform public.join_community_group(general);
  assert exists (select 1 from public.chat_participants where chat_id = general and user_id = auth.uid());
  delete from public.chat_participants where chat_id = a and user_id = auth.uid();
end $$;
select test.logout();
do $$
declare general uuid := (select id from cx where name = 'general');
begin
  assert not exists (select 1 from public.chat_participants where chat_id = general and user_id = '00000000-0000-0000-0000-00000000000e'),
    'leaving the community removes you from its groups';
end $$;

-- An admin removing a member has the same effect.
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare a uuid := (select id from cx where name = 'announcements');
begin
  delete from public.chat_participants where chat_id = a and user_id = '00000000-0000-0000-0000-00000000000d';
end $$;
select test.logout();
do $$
declare existing uuid := (select id from cx where name = 'existing');
begin
  assert not exists (select 1 from public.chat_participants where chat_id = existing and user_id = '00000000-0000-0000-0000-00000000000d'),
    'removing a member from the community removes them from its groups';
  assert exists (select 1 from public.chat_participants where chat_id = existing and user_id = '00000000-0000-0000-0000-00000000000a'),
    'other members are untouched';
end $$;

-- ------------------------------------------------------------------ editing
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  cid uuid := (select id from cx where name = 'community');
  a uuid := (select id from cx where name = 'announcements');
begin
  perform public.update_community(cid, 'Neighbourhood Watch', 'Updated');
  assert (select name from public.chats where id = a) = 'Neighbourhood Watch', 'renaming the community renames its announcements chat';
  update public.chats set name = 'Watch v2' where id = a;
  assert (select name from public.community_overview()) = 'Watch v2', 'and renaming the chat renames the community';
  perform public.remove_group_from_community(cid, (select id from cx where name = 'existing'));
  assert (select group_count from public.community_overview()) = 1, 'a group can be unlinked';
  assert exists (select 1 from public.chats where id = (select id from cx where name = 'existing')), 'the unlinked group keeps existing';
end $$;
select test.logout();

-- ------------------------------------------------------------------ an ordinary group is never confused with an announcements chat
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  ann uuid;
  grp uuid;
begin
  perform public.create_community('Crew', '', array['00000000-0000-0000-0000-00000000000b']::uuid[]);
  select announcement_chat_id into ann from public.communities where name = 'Crew';
  grp := public.get_or_create_group_chat('Crew', array['00000000-0000-0000-0000-00000000000b']::uuid[]);
  assert grp <> ann, 'creating a group named like a community does not return its announcements chat';
end $$;
select test.logout();

-- ------------------------------------------------------------------ deactivating
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  cid uuid := (select id from cx where name = 'community');
  a uuid := (select id from cx where name = 'announcements');
  general uuid := (select id from cx where name = 'general');
begin
  perform public.deactivate_community(cid);
  assert not exists (select 1 from public.communities where id = cid), 'the community is gone';
  assert not exists (select 1 from public.chats where id = a), 'and its announcements chat';
  assert exists (select 1 from public.chats where id = general), 'its groups survive as ordinary groups';
  assert test.rows(format('select 1 from public.chat_participants where chat_id = %L', general)) >= 2, 'with their members intact';
  assert (select community_id from public.chat_overview() where chat_id = general) is null, 'no longer tagged with a community';
end $$;
select test.logout();
