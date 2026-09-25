-- Profiles were readable by every authenticated user, which made `discoverable_by` unenforceable and
-- allowed enumerating all accounts. Rows are now visible only to people who already have a relationship
-- with the profile owner; strangers find someone through find_profile(), which honours their setting.

create or replace function public.can_see_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_profile_id = auth.uid()
    or exists (
      select 1
      from public.chat_participants mine
      join public.chat_participants theirs on theirs.chat_id = mine.chat_id
      where mine.user_id = auth.uid() and theirs.user_id = target_profile_id
    )
    or exists (
      select 1 from public.contacts
      where (owner_id = auth.uid() and contact_id = target_profile_id)
         or (owner_id = target_profile_id and contact_id = auth.uid())
    );
$$;

drop policy profiles_select_authenticated on public.profiles;
create policy profiles_select_visible on public.profiles for select to authenticated using (public.can_see_profile(id));

-- Exact-match lookup by @username or email. Email matches require the target to opt in.
create or replace function public.find_profile(search text)
returns table (id uuid, username text, display_name text, about text, avatar_url text, is_contact boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  term text := lower(trim(coalesce(search, '')));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(term) < 3 or char_length(term) > 254 then
    return;
  end if;
  -- "@name" is a username; anything else containing "@" is treated as an email address.
  if left(term, 1) = '@' and position('@' in substring(term from 2)) = 0 then
    term := substring(term from 2);
  end if;

  if position('@' in term) > 1 then
    return query
      select p.id, p.username, p.display_name, p.about, p.avatar_url,
             exists (select 1 from public.contacts c where c.owner_id = auth.uid() and c.contact_id = p.id)
      from public.profiles p
      join auth.users u on u.id = p.id
      where lower(u.email) = term
        and p.discoverable_by = 'username_and_email'
        and p.id <> auth.uid();
  else
    return query
      select p.id, p.username, p.display_name, p.about, p.avatar_url,
             exists (select 1 from public.contacts c where c.owner_id = auth.uid() and c.contact_id = p.id)
      from public.profiles p
      where p.username = term
        and p.discoverable_by in ('username', 'username_and_email')
        and p.id <> auth.uid();
  end if;
end;
$$;

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and candidate ~ '^[a-z0-9_]{3,20}$'
    and not exists (select 1 from public.profiles where username = candidate);
$$;

revoke all on function public.can_see_profile(uuid), public.find_profile(text), public.username_available(text) from public;
grant execute on function public.can_see_profile(uuid), public.find_profile(text), public.username_available(text) to authenticated;
