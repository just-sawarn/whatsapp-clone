-- What the client reads: one row per message with only the caller's own wrapped key (encrypted_keys holds a
-- key for every participant, which is wasteful and unnecessary to ship) and the sender key to decrypt with.
-- security_invoker makes the view obey the messages RLS (membership, hidden_for, blocks).
create view public.message_view with (security_invoker = true) as
select
  m.id,
  m.chat_id,
  m.sender_id,
  m.ciphertext,
  m.iv,
  m.encrypted_keys ->> (auth.uid())::text as wrapped_key,
  coalesce(m.sender_public_key, sp.public_key) as sender_public_key,
  m.message_type,
  m.media_path,
  m.duration_seconds,
  m.reply_to_id,
  m.is_forwarded,
  m.created_at,
  m.deleted_at
from public.messages m
left join public.profiles sp on sp.id = m.sender_id;

grant select on public.message_view to authenticated;

-- "Delete chat" in a direct conversation: hide every message for me (the other person keeps theirs). The
-- client also archives the chat; the next incoming message brings it back.
create or replace function public.clear_chat_for_me(target_chat_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
  set hidden_for = array_append(hidden_for, auth.uid())
  where chat_id = target_chat_id
    and public.is_chat_member(chat_id)
    and not (auth.uid() = any (hidden_for));
$$;

revoke all on function public.clear_chat_for_me(uuid) from public;
grant execute on function public.clear_chat_for_me(uuid) to authenticated;
