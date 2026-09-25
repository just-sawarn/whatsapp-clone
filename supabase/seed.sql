-- Create two local users first with `supabase auth users create` or the Auth dashboard.
-- This seed links the first two local Auth users into a sample encrypted chat.

insert into public.profiles (id, username, display_name, public_key)
select id, 'demo_' || left(replace(id::text, '-', ''), 12), 'Demo user ' || row_number() over (order by created_at), 'local-development-public-key'
from auth.users
where id not in (select id from public.profiles)
order by created_at
limit 2
on conflict (id) do nothing;

do $$
declare
  first_user uuid;
  second_user uuid;
  demo_chat uuid;
begin
  select id into first_user from public.profiles order by created_at limit 1;
  select id into second_user from public.profiles where id <> first_user order by created_at limit 1;

  if first_user is null or second_user is null then
    raise notice 'Create at least two local Auth users before running the seed.';
    return;
  end if;

  insert into public.chats (is_group, created_by)
  values (false, first_user)
  returning id into demo_chat;

  insert into public.chat_participants (chat_id, user_id, role)
  values (demo_chat, first_user, 'admin'), (demo_chat, second_user, 'member')
  on conflict (chat_id, user_id) do nothing;
end $$;
