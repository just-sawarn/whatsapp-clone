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

  select cp.chat_id into existing_chat_id
  from public.chat_participants cp
  join public.chats c on c.id = cp.chat_id
  where cp.user_id = current_user_id
    and c.is_group = false
    and (select count(*) from public.chat_participants members where members.chat_id = cp.chat_id) = 2
    and exists (select 1 from public.chat_participants other_member where other_member.chat_id = cp.chat_id and other_member.user_id = other_user_id)
  limit 1
  for update of c;

  if existing_chat_id is not null then
    return existing_chat_id;
  end if;

  insert into public.chats (id, is_group, created_by)
  values (new_chat_id, false, current_user_id);
  insert into public.chat_participants (chat_id, user_id, role)
  values (new_chat_id, current_user_id, 'admin'), (new_chat_id, other_user_id, 'member');
  return new_chat_id;
end;
$$;

create or replace function public.get_or_create_group_chat(group_name text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  desired_members uuid[];
  existing_chat_id uuid;
  new_chat_id uuid := gen_random_uuid();
  member_id uuid;
begin
  if current_user_id is null or group_name is null or char_length(trim(group_name)) = 0 then
    raise exception 'Invalid group details';
  end if;

  select array_agg(distinct member_id order by member_id)
  into desired_members
  from unnest(array_append(coalesce(member_ids, '{}'::uuid[]), current_user_id)) as members(member_id);

  if coalesce(array_length(desired_members, 1), 0) < 2 then
    raise exception 'A group needs at least one other member';
  end if;

  select c.id into existing_chat_id
  from public.chats c
  where c.is_group = true
    and lower(trim(c.name)) = lower(trim(group_name))
    and exists (select 1 from public.chat_participants owner_member where owner_member.chat_id = c.id and owner_member.user_id = current_user_id)
    and (select count(*) from public.chat_participants members where members.chat_id = c.id) = array_length(desired_members, 1)
    and not exists (
      select 1 from public.chat_participants members
      where members.chat_id = c.id and not (members.user_id = any(desired_members))
    )
  limit 1
  for update;

  if existing_chat_id is not null then
    return existing_chat_id;
  end if;

  insert into public.chats (id, is_group, name, created_by)
  values (new_chat_id, true, trim(group_name), current_user_id);
  foreach member_id in array desired_members loop
    insert into public.chat_participants (chat_id, user_id, role)
    values (new_chat_id, member_id, case when member_id = current_user_id then 'admin' else 'member' end);
  end loop;
  return new_chat_id;
end;
$$;

grant execute on function public.get_or_create_direct_chat(uuid) to authenticated;
grant execute on function public.get_or_create_group_chat(text, uuid[]) to authenticated;
