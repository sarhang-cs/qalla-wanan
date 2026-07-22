-- QALLA WANAN / NAV KURD optional spatial-performance upgrade.
-- Safe to run after 001_initial_schema.sql on the existing Supabase project.

begin;

create extension if not exists postgis;

alter table public.places
  add column if not exists location geography(Point, 4326);

update public.places
set location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
where location is null
   or abs(ST_X(location::geometry) - longitude) > 0.000000001
   or abs(ST_Y(location::geometry) - latitude) > 0.000000001;

create or replace function public.sync_place_location()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.location := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;

drop trigger if exists places_sync_location on public.places;
create trigger places_sync_location
before insert or update of longitude, latitude on public.places
for each row execute function public.sync_place_location();

create index if not exists places_location_gix
  on public.places using gist(location);

create index if not exists places_published_priority_idx
  on public.places(priority desc, updated_at desc)
  where status = 'published';

create or replace function public.published_places_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 5000
)
returns table (
  id uuid,
  name_ku text,
  name_ar text,
  name_en text,
  category text,
  category_ku text,
  admin_governorate_ku text,
  admin_district_ku text,
  latitude double precision,
  longitude double precision,
  min_zoom numeric,
  priority numeric,
  status text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id, p.name_ku, p.name_ar, p.name_en, p.category, p.category_ku,
    p.admin_governorate_ku, p.admin_district_ku,
    p.latitude, p.longitude, p.min_zoom, p.priority, p.status
  from public.places p
  where p.status = 'published'
    and p.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  order by p.priority desc, p.updated_at desc
  limit least(greatest(max_rows, 1), 10000);
$$;

grant execute on function public.published_places_in_bbox(double precision, double precision, double precision, double precision, integer)
  to anon, authenticated;

commit;
