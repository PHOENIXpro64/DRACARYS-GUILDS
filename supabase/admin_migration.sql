-- DRACARYS admin-system extension
-- Run once in the Supabase SQL Editor after supabase/schema.sql.
-- This migration adds only the missing announcement and portrait-management features.

create extension if not exists pgcrypto;

create table if not exists public.guild_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 1200),
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists announcements_updated_at on public.guild_announcements;
create trigger announcements_updated_at before update on public.guild_announcements
for each row execute procedure public.set_updated_at();

alter table public.guild_announcements enable row level security;
revoke all on table public.guild_announcements from anon, authenticated;
grant select on table public.guild_announcements to anon, authenticated;

drop policy if exists "published announcements are public" on public.guild_announcements;
create policy "published announcements are public" on public.guild_announcements for select to anon, authenticated
  using (is_published or public.is_admin());

-- All announcement mutations remain inside a server-side function that checks the caller.
create or replace function public.admin_manage_announcement(
  p_action text,
  p_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_is_published boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;

  if v_action not in ('create', 'update', 'delete') then raise exception 'Invalid announcement action.'; end if;
  if v_action in ('create', 'update') and (char_length(v_title) not between 2 and 120 or char_length(v_body) not between 2 and 1200) then
    raise exception 'Announcement title or message is outside the allowed length.';
  end if;

  if v_action = 'create' then
    insert into public.guild_announcements (title, body, is_published, created_by)
    values (v_title, v_body, coalesce(p_is_published, true), auth.uid())
    returning id into v_id;
  elsif v_action = 'update' then
    if p_id is null then raise exception 'Announcement id is required.'; end if;
    update public.guild_announcements
      set title = v_title, body = v_body, is_published = coalesce(p_is_published, true)
      where id = p_id
      returning id into v_id;
    if v_id is null then raise exception 'Announcement not found.'; end if;
  else
    if p_id is null then raise exception 'Announcement id is required.'; end if;
    delete from public.guild_announcements where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Announcement not found.'; end if;
  end if;

  return jsonb_build_object('id', v_id, 'action', v_action);
end;
$$;

-- Clearing an official portrait is also server-side so an admin cannot set an
-- arbitrary profile field from the browser.
create or replace function public.admin_clear_avatar(p_target_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_avatar_path text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  update public.profiles set avatar_path = null
    where id = p_target_id
    returning avatar_path into v_avatar_path;
  if not found then raise exception 'Account not found.'; end if;
  return v_avatar_path;
end;
$$;

revoke all on function public.admin_manage_announcement(text, uuid, text, text, boolean) from public;
revoke all on function public.admin_clear_avatar(uuid) from public;
grant execute on function public.admin_manage_announcement(text, uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_clear_avatar(uuid) to authenticated;
