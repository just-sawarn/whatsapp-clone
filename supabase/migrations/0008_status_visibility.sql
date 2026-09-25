-- Statuses: the audience is decided by the poster. A viewer sees a status only when both people have each
-- other as (non-blocked) contacts. The original rule let anyone who added you as a contact watch your statuses.

alter table public.statuses add column bg_color text check (bg_color is null or bg_color ~ '^#[0-9a-fA-F]{6}$');

create or replace function public.can_view_status(target_status_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_status_user_id = auth.uid()
    or (
      exists (
        select 1 from public.contacts theirs
        where theirs.owner_id = target_status_user_id and theirs.contact_id = auth.uid() and not theirs.is_blocked
      )
      and exists (
        select 1 from public.contacts mine
        where mine.owner_id = auth.uid() and mine.contact_id = target_status_user_id and not mine.is_blocked
      )
    );
$$;

-- Viewers need to know which statuses they have already seen (the original policy exposed views to the poster only).
create policy status_views_select_own on public.status_views for select to authenticated using (viewer_id = auth.uid());

create index statuses_expiry_idx on public.statuses (expires_at);
