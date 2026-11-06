-- DRACARYS Supabase schema
-- Run this file once in the Supabase SQL Editor, using a project owner role.
-- It deliberately never creates an administrator from the browser.

create type public.app_role as enum ('visitor', 'member', 'admin');
create type public.membership_state as enum ('not_member', 'pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  avatar_path text,
  ff_name text check (char_length(ff_name) <= 40),
  ff_uid text check (ff_uid is null or ff_uid ~ '^[0-9]{4,24}$'),
  role public.app_role not null default 'visitor',
  membership_status public.membership_state not null default 'not_member',
  guild_position text check (guild_position is null or char_length(guild_position) between 1 and 50),
  is_leader boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.site_settings (
  id text primary key default 'primary' check (id = 'primary'),
  guild_name text not null default 'DRACARYS' check (char_length(guild_name) between 2 and 50),
  description text not null default 'A guild of discipline, loyalty, and relentless ambition.' check (char_length(description) between 10 and 1000),
  recruitment_text text not null default 'Create your DRACARYS account, complete your profile, then send your membership request for the council’s review.' check (char_length(recruitment_text) between 10 and 1000),
  social_links jsonb not null default '{"links": []}'::jsonb,
  logo_path text,
  entry_video_path text,
  background_video_path text,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.site_settings (id) values ('primary') on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = timezone('utc', now()); return new; end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger settings_updated_at before update on public.site_settings for each row execute procedure public.set_updated_at();

-- This trigger is the only normal account-creation path. Values that affect roles
-- are not read from client metadata, so sign-up requests cannot make an administrator.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_username text;
begin
  v_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  if v_username !~ '^[a-z0-9_]{3,24}$' or exists(select 1 from public.profiles where username = v_username) then
    v_username := 'player_' || substring(replace(new.id::text, '-', '') from 1 for 12);
  end if;
  insert into public.profiles (id, username, role, membership_status)
  values (new.id, v_username, 'visitor', 'not_member');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- SECURITY DEFINER prevents RLS recursion and is used only as a boolean guard.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.site_settings enable row level security;

-- Approved players are the public roster. Every signed-in user can read only their
-- own private record, while administrators may read all records.
create policy "approved roster is public" on public.profiles for select to anon, authenticated
  using (membership_status = 'approved' or auth.uid() = id or public.is_admin());
create policy "owner updates only their permitted record" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "settings are publicly readable" on public.site_settings for select to anon, authenticated using (true);

-- Authenticated callers get column-level update rights only for profile fields they own.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (avatar_path, ff_name, ff_uid) on table public.profiles to authenticated;
revoke all on table public.site_settings from anon, authenticated;
grant select on table public.site_settings to anon, authenticated;

-- A visitor can request review. This is the only membership-status change allowed
-- outside the administrator RPCs.
create or replace function public.request_membership()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  update public.profiles set membership_status = 'pending'
    where id = auth.uid() and membership_status in ('not_member', 'rejected');
  if not found then raise exception 'A membership request cannot be made at this time.'; end if;
end;
$$;

create or replace function public.admin_set_membership_status(p_target_id uuid, p_membership_status public.membership_state)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if exists(select 1 from public.profiles where id = p_target_id and role = 'admin') then raise exception 'Administrator membership cannot be changed here.'; end if;
  if p_membership_status = 'pending' then raise exception 'Only a user can submit a pending request.'; end if;
  update public.profiles set
    membership_status = p_membership_status,
    role = case when p_membership_status = 'approved' then 'member'::public.app_role else 'visitor'::public.app_role end,
    guild_position = case when p_membership_status = 'approved' then coalesce(guild_position, 'Member') else null end,
    is_leader = case when p_membership_status = 'approved' then is_leader else false end
  where id = p_target_id;
  if not found then raise exception 'Account not found.'; end if;
end;
$$;

create or replace function public.admin_update_member(
  p_target_id uuid, p_ff_name text, p_ff_uid text, p_guild_position text, p_is_leader boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if not exists(select 1 from public.profiles where id = p_target_id and membership_status = 'approved') then raise exception 'Only approved guild members can be edited here.'; end if;
  if lower(trim(p_guild_position)) = 'guild leader' then
    update public.profiles set guild_position = 'Vice Leader', is_leader = true
      where id <> p_target_id and lower(coalesce(guild_position, '')) = 'guild leader';
  end if;
  update public.profiles set ff_name = p_ff_name, ff_uid = p_ff_uid,
    guild_position = left(trim(p_guild_position), 50), is_leader = p_is_leader
    where id = p_target_id;
end;
$$;

create or replace function public.admin_set_avatar(p_target_id uuid, p_avatar_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_avatar_path !~ ('^' || p_target_id::text || '/.+') then raise exception 'Invalid avatar path.'; end if;
  update public.profiles set avatar_path = p_avatar_path where id = p_target_id;
  if not found then raise exception 'Account not found.'; end if;
end;
$$;

create or replace function public.admin_update_settings(p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Invalid settings payload.'; end if;
  update public.site_settings set
    guild_name = case when p_patch ? 'guild_name' then left(trim(p_patch->>'guild_name'), 50) else guild_name end,
    description = case when p_patch ? 'description' then left(trim(p_patch->>'description'), 1000) else description end,
    recruitment_text = case when p_patch ? 'recruitment_text' then left(trim(p_patch->>'recruitment_text'), 1000) else recruitment_text end,
    social_links = case when p_patch ? 'social_links' and jsonb_typeof(p_patch->'social_links') = 'object' then p_patch->'social_links' else social_links end,
    logo_path = case when p_patch ? 'logo_path' then nullif(p_patch->>'logo_path', '') else logo_path end,
    entry_video_path = case when p_patch ? 'entry_video_path' then nullif(p_patch->>'entry_video_path', '') else entry_video_path end,
    background_video_path = case when p_patch ? 'background_video_path' then nullif(p_patch->>'background_video_path', '') else background_video_path end
  where id = 'primary';
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
revoke all on function public.request_membership() from public;
revoke all on function public.admin_set_membership_status(uuid, public.membership_state) from public;
revoke all on function public.admin_update_member(uuid, text, text, text, boolean) from public;
revoke all on function public.admin_set_avatar(uuid, text) from public;
revoke all on function public.admin_update_settings(jsonb) from public;
grant execute on function public.request_membership() to authenticated;
grant execute on function public.admin_set_membership_status(uuid, public.membership_state) to authenticated;
grant execute on function public.admin_update_member(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.admin_set_avatar(uuid, text) to authenticated;
grant execute on function public.admin_update_settings(jsonb) to authenticated;

-- Public delivery is intentional: member photos and cinematic media are displayed
-- on the public website. Only the owner or an administrator may write to them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guild-media', 'guild-media', true, 104857600, array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "public avatar delivery" on storage.objects for select to public using (bucket_id = 'avatars');
create policy "owners upload their avatar" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);
create policy "owners update their avatar" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete their avatar" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "administrators manage avatars" on storage.objects for all to authenticated using (
  bucket_id = 'avatars' and public.is_admin()
) with check (bucket_id = 'avatars' and public.is_admin());
create policy "public guild media delivery" on storage.objects for select to public using (bucket_id = 'guild-media');
create policy "administrators manage guild media" on storage.objects for all to authenticated using (
  bucket_id = 'guild-media' and public.is_admin()
) with check (bucket_id = 'guild-media' and public.is_admin());

-- Initial administrator (run manually in the SQL Editor after registering the account):
-- update public.profiles
-- set role = 'admin', membership_status = 'approved', guild_position = 'Guild Leader', is_leader = true
-- where username = 'your_exact_username';
