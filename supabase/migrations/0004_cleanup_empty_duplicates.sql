-- Remove only duplicate conversations that have never contained a message.
-- The oldest chat remains the canonical conversation.
with direct_groups as (
  select
    c.id,
    row_number() over (partition by array_agg(cp.user_id order by cp.user_id) order by c.created_at, c.id) as duplicate_number
  from public.chats c
  join public.chat_participants cp on cp.chat_id = c.id
  where c.is_group = false
  group by c.id
  having count(*) = 2
), empty_direct_duplicates as (
  select dg.id
  from direct_groups dg
  where dg.duplicate_number > 1
    and not exists (select 1 from public.messages m where m.chat_id = dg.id)
)
delete from public.chats c
where c.id in (select id from empty_direct_duplicates);

with group_groups as (
  select
    c.id,
    row_number() over (
      partition by lower(trim(c.name)), array_agg(cp.user_id order by cp.user_id)
      order by c.created_at, c.id
    ) as duplicate_number
  from public.chats c
  join public.chat_participants cp on cp.chat_id = c.id
  where c.is_group = true
  group by c.id, lower(trim(c.name))
), empty_group_duplicates as (
  select gg.id
  from group_groups gg
  where gg.duplicate_number > 1
    and not exists (select 1 from public.messages m where m.chat_id = gg.id)
)
delete from public.chats c
where c.id in (select id from empty_group_duplicates);
