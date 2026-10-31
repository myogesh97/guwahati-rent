-- 0004: To-Let photo boards (Phase 2a) + survey-import columns on pins (Phase 2b).
-- From NEXT-PHASES.md §2a.5, with two fixes:
--   * numbered 0004 (0003 is already living conditions; two 0003s would collide in schema_migrations)
--   * public_pins repeats the exact column list from 0003_living_conditions.sql and only appends
--     source, location_approx (create or replace view cannot drop or reorder columns).
-- Boards expire after 60 days (NEXT-PHASES.md §1b).

-- ===== To-Let boards: upload lifecycle, thumbnails, expiry =====
alter table public.tolet_boards drop constraint if exists tolet_boards_status_check;
alter table public.tolet_boards
  add constraint tolet_boards_status_check
  check (status in ('uploading', 'pending', 'approved', 'rejected', 'gone'));

alter table public.tolet_boards
  add column if not exists thumb_path        text,
  add column if not exists public_thumb_path text,
  add column if not exists uploader_hash     text,  -- sha256(browserId + HASH_SALT); abuse tracing only
  add column if not exists expires_at        timestamptz not null default now() + interval '60 days';

alter table public.tolet_boards alter column status set default 'uploading';
create index if not exists tolet_status_idx on public.tolet_boards (status, expires_at);

-- "Board gone" reports, one per browser per board
create table if not exists public.tolet_reports (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.tolet_boards(id) on delete cascade,
  reporter_hash text not null,
  created_at    timestamptz not null default now(),
  unique (board_id, reporter_hash)
);
alter table public.tolet_reports enable row level security;   -- no policies: service role only

create or replace function public.bump_tolet_gone() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.tolet_boards set gone_reports = gone_reports + 1 where id = new.board_id;
  return new;
end $$;
drop trigger if exists tolet_reports_bump on public.tolet_reports;
create trigger tolet_reports_bump after insert on public.tolet_reports
for each row execute function public.bump_tolet_gone();

-- Public view: approved, not reported gone, not expired. No private paths, no uploader hash.
-- (The old view also exposed phone_text / note / spotter_name; boards no longer collect them.)
drop view if exists public.public_tolet;
create view public.public_tolet with (security_barrier) as
select id, public_photo_path, public_thumb_path, created_at, expires_at,
       extensions.st_y(location::extensions.geometry) as lat,
       extensions.st_x(location::extensions.geometry) as lng
from public.tolet_boards
where status = 'approved' and gone_reports < 3 and expires_at > now();

-- Storage hardening
update storage.buckets
set file_size_limit = 524288, allowed_mime_types = array['image/webp', 'image/jpeg']
where id in ('tolet', 'tolet-public');

-- ===== Survey imports (Phase 2b) =====
alter table public.pins
  add column if not exists source          text not null default 'user' check (source in ('user', 'survey')),
  add column if not exists location_approx boolean not null default false,
  add column if not exists import_ref      text unique;   -- hash of the form row; makes re-imports idempotent

-- Same columns, same order as 0003_living_conditions.sql; the two new public columns go at the END.
-- import_ref stays private.
create or replace view public.public_pins with (security_barrier) as
select
  id, kind, property_type, bhk, rent, furnishing, gated, maintenance_incl,
  deposit_months, sqft, parking_cars, society_name, occupants, pets_allowed,
  waterlogging, water_supply, power_backup, pg_meals, pg_gender,
  available_from, tenant_pref, room_gender_pref, room_smoking_ok, room_food_pref,
  one_liner, locality_slug, is_outlier, created_at,
  extensions.st_y(location::extensions.geometry) as lat,
  extensions.st_x(location::extensions.geometry) as lng,
  water_sources, water_availability, water_litres, water_hours, water_extra_cost,
  water_shared, drinking_water, water_note,
  waterlog_where, waterlog_severity, waterlog_duration, road_in_rain, floor_level, waterlog_note,
  power_cuts, maintenance_amount, conditions_as_of,
  source, location_approx
from public.pins
where status = 'active'
  and report_count < 3
  and (listing_expires_at is null or listing_expires_at > now());

-- ===== Privileges =====
revoke all on public.tolet_reports from anon, authenticated;
revoke execute on function public.bump_tolet_gone() from anon, authenticated, public;
grant select on public.public_tolet, public.public_pins to anon, authenticated;
grant all on public.tolet_reports to service_role;
