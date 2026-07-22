-- QALLA WANAN / NAV KURD map backend for Supabase PostgreSQL
-- Run in Supabase SQL Editor on a fresh project.

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  name_ku text not null check (char_length(trim(name_ku)) between 1 and 180),
  name_ar text,
  name_en text,
  category text not null default 'place',
  category_ku text,
  admin_governorate_ku text,
  admin_district_ku text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  min_zoom numeric(4,2) not null default 11.50 check (min_zoom between 5 and 20),
  priority numeric(8,3) not null default 260,
  status text not null default 'pending' check (status in ('pending','published','rejected','archived')),
  rejection_reason text,
  source_note text,
  metadata jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists places_status_idx on public.places(status);
create index if not exists places_owner_idx on public.places(owner_id);
create index if not exists places_coordinates_idx on public.places(latitude, longitude);
create index if not exists places_name_ku_idx on public.places using gin (to_tsvector('simple', coalesce(name_ku,'')));

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at before update on public.places
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.protect_profile_role()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then new.role = old.role; end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
for each row execute function public.protect_profile_role();

create or replace function public.reset_place_review_on_user_edit()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() = old.owner_id and not public.is_admin() then
    new.status = 'pending';
    new.reviewed_by = null;
    new.reviewed_at = null;
    new.rejection_reason = null;
  end if;
  return new;
end;
$$;

drop trigger if exists places_reset_review on public.places;
create trigger places_reset_review before update on public.places
for each row execute function public.reset_place_review_on_user_edit();

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.favorites enable row level security;

-- Policies are recreated safely so the migration can be rerun.
drop policy if exists "profiles_self_read" on public.profiles;
drop policy if exists "profiles_admin_read" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "places_published_read" on public.places;
drop policy if exists "places_owner_read" on public.places;
drop policy if exists "places_admin_read" on public.places;
drop policy if exists "places_authenticated_insert" on public.places;
drop policy if exists "places_owner_update" on public.places;
drop policy if exists "places_owner_delete" on public.places;
drop policy if exists "places_admin_all" on public.places;
drop policy if exists "favorites_self_read" on public.favorites;
drop policy if exists "favorites_self_insert" on public.favorites;
drop policy if exists "favorites_self_delete" on public.favorites;

-- Profiles
create policy "profiles_self_read" on public.profiles for select using (auth.uid() = id);
create policy "profiles_admin_read" on public.profiles for select using (public.is_admin());
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_admin_update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- Places: anonymous users only see published rows. Authenticated owners see their own rows.
create policy "places_published_read" on public.places for select using (status = 'published');
create policy "places_owner_read" on public.places for select using (auth.uid() = owner_id);
create policy "places_admin_read" on public.places for select using (public.is_admin());
create policy "places_authenticated_insert" on public.places for insert to authenticated
  with check (auth.uid() = owner_id and status = 'pending');
create policy "places_owner_update" on public.places for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "places_owner_delete" on public.places for delete to authenticated
  using (auth.uid() = owner_id);
create policy "places_admin_all" on public.places for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Favorites
create policy "favorites_self_read" on public.favorites for select using (auth.uid() = user_id);
create policy "favorites_self_insert" on public.favorites for insert with check (auth.uid() = user_id);
create policy "favorites_self_delete" on public.favorites for delete using (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.places to anon;
grant select, insert, update, delete on public.places to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;

commit;

-- After your own account signs in once, run this once with its email:
-- update public.profiles p set role='admin'
-- from auth.users u where p.id=u.id and u.email='YOUR_ADMIN_EMAIL';
