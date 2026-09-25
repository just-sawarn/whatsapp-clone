-- Group and community photos: who may upload, who may see them, and where they may live.
-- Runs after 20_communities.sql (helpers and users alice..erin exist).

create temp table av (name text primary key, id uuid);
grant all on av to public;

select test.login('00000000-0000-0000-0000-00000000000a');
insert into av select 'group', public.get_or_create_group_chat('Photo group', array['00000000-0000-0000-0000-00000000000b']::uuid[]);
insert into av select 'direct', public.get_or_create_direct_chat('00000000-0000-0000-0000-00000000000b');
insert into av select 'community', public.create_community('Photo community', '', array['00000000-0000-0000-0000-00000000000d']::uuid[]);
do $$
declare g uuid := (select id from av where name = 'group');
begin
  perform public.add_group_to_community((select id from av where name = 'community'), g);
end $$;
select test.logout();

-- ------------------------------------------------------------------ uploading
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  g uuid := (select id from av where name = 'group');
  d uuid := (select id from av where name = 'direct');
begin
  insert into storage.objects (bucket_id, name) values ('chat-avatars', g || '/photo1.jpg');
  update public.chats set avatar_url = g || '/photo1.jpg' where id = g;
  assert (select avatar_url from public.chats where id = g) = g || '/photo1.jpg', 'an admin can set the group photo';

  perform test.fails(format($f$insert into storage.objects (bucket_id, name) values ('chat-avatars', %L)$f$, d || '/x.jpg'), 'row-level security');
  perform test.fails(format($f$update public.chats set avatar_url = %L where id = %L$f$, d || '/x.jpg', g), 'own folder');
  perform test.fails(format($f$update public.chats set avatar_url = 'somewhere/else.jpg' where id = %L$f$, g), 'own folder');
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000b');
do $$
declare g uuid := (select id from av where name = 'group');
begin
  assert test.rows(format('select 1 from storage.objects where bucket_id = ''chat-avatars'' and name like %L', g || '/%')) = 1, 'a member can see the photo';
  perform test.fails(format($f$insert into storage.objects (bucket_id, name) values ('chat-avatars', %L)$f$, g || '/mine.jpg'), 'row-level security');
  assert test.affected(format($f$delete from storage.objects where bucket_id = 'chat-avatars' and name = %L$f$, g || '/photo1.jpg')) = 0, 'a member cannot delete it';
  assert test.affected(format($f$update public.chats set avatar_url = %L where id = %L$f$, g || '/mine.jpg', g)) = 0, 'a member cannot change it';
end $$;
select test.logout();

-- ------------------------------------------------------------------ who can see it
select test.login('00000000-0000-0000-0000-00000000000c');
do $$ begin assert test.rows('select 1 from storage.objects where bucket_id = ''chat-avatars''') = 0, 'an outsider cannot see it'; end $$;
select test.logout();

-- Dave is in the community but not in the group: he can see the group's photo (to recognise it), and nothing else.
select test.login('00000000-0000-0000-0000-00000000000d');
do $$
declare g uuid := (select id from av where name = 'group');
begin
  assert test.rows(format('select 1 from storage.objects where bucket_id = ''chat-avatars'' and name like %L', g || '/%')) = 1,
    'a community member can see the photos of the community''s groups';
  assert (select avatar_url from public.community_groups_overview((select id from av where name = 'community')) where chat_id = g) = g || '/photo1.jpg',
    'and the overview returns the photo path';
  perform test.fails(format($f$insert into storage.objects (bucket_id, name) values ('chat-avatars', %L)$f$, g || '/d.jpg'), 'row-level security');
end $$;
select test.logout();

-- A group that leaves the community stops sharing its photo with it.
select test.login('00000000-0000-0000-0000-00000000000a');
select public.remove_group_from_community((select id from av where name = 'community'), (select id from av where name = 'group'));
select test.logout();
select test.login('00000000-0000-0000-0000-00000000000d');
do $$ begin assert test.rows('select 1 from storage.objects where bucket_id = ''chat-avatars''') = 0, 'unlinking hides the photo again'; end $$;
select test.logout();

-- ------------------------------------------------------------------ community photo = announcements chat photo
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  a uuid := (select announcement_chat_id from public.communities where id = (select id from av where name = 'community'));
begin
  insert into storage.objects (bucket_id, name) values ('chat-avatars', a || '/logo.jpg');
  update public.chats set avatar_url = a || '/logo.jpg' where id = a;
  assert (select avatar_url from public.community_overview() where community_id = (select id from av where name = 'community')) = a || '/logo.jpg', 'the community photo is the announcements photo';
end $$;
select test.logout();

select test.login('00000000-0000-0000-0000-00000000000d');
do $$
declare a uuid := (select announcement_chat_id from public.communities where id = (select id from av where name = 'community'));
begin
  assert (select avatar_url from public.community_overview() where community_id = (select id from av where name = 'community')) = a || '/logo.jpg', 'members get the community photo';
  assert test.rows(format('select 1 from storage.objects where bucket_id = ''chat-avatars'' and name like %L', a || '/%')) = 1, 'and can load it';
  assert test.affected(format($f$delete from storage.objects where bucket_id = 'chat-avatars' and name = %L$f$, a || '/logo.jpg')) = 0, 'but not delete it';
end $$;
select test.logout();

-- Removing works for the admin.
select test.login('00000000-0000-0000-0000-00000000000a');
do $$
declare g uuid := (select id from av where name = 'group');
begin
  assert test.affected(format($f$delete from storage.objects where bucket_id = 'chat-avatars' and name = %L$f$, g || '/photo1.jpg')) = 1, 'an admin can remove the photo';
  update public.chats set avatar_url = null where id = g;
  assert (select avatar_url from public.chats where id = g) is null;
end $$;
select test.logout();
