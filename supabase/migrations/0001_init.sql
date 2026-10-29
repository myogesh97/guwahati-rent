-- Generated verbatim from SPEC.md v2 §6.1 + §6.2 (storage). Do not edit here without updating SPEC.md.

-- =========================================================
-- Extensions (Supabase convention: extensions schema)
-- =========================================================
create extension if not exists postgis  with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- =========================================================
-- Enums
-- =========================================================
create type public.pin_kind       as enum ('rent', 'listing_whole', 'listing_room');
create type public.property_type  as enum ('flat', 'independent', 'pg', '1rk', 'room', 'studio');
create type public.furnishing     as enum ('furnished', 'semi', 'unfurnished');
create type public.waterlog_level as enum ('none', 'road_only', 'enters_premises', 'unknown');
create type public.row_status     as enum ('active', 'hidden', 'archived');
create type public.move_in        as enum ('asap', 'next_month', 'flexible');
create type public.pref3          as enum ('yes', 'no', 'any');

-- =========================================================
-- Pins: rent data + listings
-- =========================================================
create table public.pins (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.pin_kind not null,
  property_type       public.property_type not null default 'flat',
  bhk                 smallint check (bhk between 0 and 5),       -- 0 = 1RK/studio/room/PG bed
  rent                integer not null check (rent between 1000 and 500000),
  furnishing          public.furnishing not null,
  gated               boolean not null default false,
  maintenance_incl    boolean,
  deposit_months      smallint check (deposit_months between 0 and 12),
  sqft                integer check (sqft between 80 and 10000),
  parking_cars        smallint not null default 0 check (parking_cars between 0 and 5),
  society_name        text check (char_length(society_name) <= 120),
  occupants           text check (occupants in ('family', 'bachelor')),
  pets_allowed        public.pref3,
  -- Guwahati-specific
  waterlogging        public.waterlog_level not null default 'unknown',
  water_supply        text check (water_supply in ('24x7', 'timed', 'tanker', 'unknown')),
  power_backup        text check (power_backup in ('full', 'partial', 'none', 'unknown')),
  -- PG-specific
  pg_meals            boolean,
  pg_gender           text check (pg_gender in ('boys', 'girls', 'mixed')),
  -- Listing-only
  available_from      public.move_in,
  tenant_pref         text check (tenant_pref in ('family', 'bachelor', 'any')),
  room_gender_pref    text check (room_gender_pref in ('male', 'female', 'any')),
  room_smoking_ok     public.pref3,
  room_food_pref      text check (room_food_pref in ('veg', 'nonveg_ok', 'any')),
  -- Meta
  one_liner           text check (char_length(one_liner) <= 150),
  locality_slug       text,
  location            extensions.geography(point, 4326) not null,  -- rounded to 3dp before insert
  is_outlier          boolean not null default false,
  report_count        integer not null default 0,
  status              public.row_status not null default 'active',
  edit_token_hash     text not null,
  created_at          timestamptz not null default now(),
  listing_expires_at  timestamptz                                  -- listings: now() + 45 days
);
create index pins_location_gix    on public.pins using gist (location);
create index pins_status_kind_idx on public.pins (status, kind);
create index pins_locality_idx    on public.pins (locality_slug);

create table public.pin_contacts (
  pin_id                 uuid primary key references public.pins(id) on delete cascade,
  email                  text not null,
  phone                  text,
  consent_at             timestamptz not null default now(),
  unsubscribe_token_hash text not null
);

-- =========================================================
-- Seekers
-- =========================================================
create table public.seekers (
  id                uuid primary key default gen_random_uuid(),
  looking_for       text not null check (looking_for in ('whole', 'room')),
  budget            integer not null check (budget between 1000 and 500000),
  bhk_pref          smallint check (bhk_pref between 0 and 5),     -- null = any
  property_types    public.property_type[],                         -- null = any
  move_in           public.move_in not null default 'flexible',
  gender            text check (gender in ('male', 'female', 'other')),
  gender_pref       text check (gender_pref in ('male', 'female', 'any')),
  food_pref         text check (food_pref in ('veg', 'nonveg', 'any')),
  smoker            public.pref3,
  household         text check (household in ('family', 'bachelor')),
  needs_parking     boolean not null default false,
  note              text check (char_length(note) <= 500),
  location          extensions.geography(point, 4326) not null,
  radius_m          integer not null default 3000 check (radius_m between 500 and 8000),
  status            public.row_status not null default 'active',
  edit_token_hash   text not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '30 days'
);
create index seekers_location_gix on public.seekers using gist (location);

create table public.seeker_contacts (
  seeker_id              uuid primary key references public.seekers(id) on delete cascade,
  email                  text not null,
  phone                  text,
  consent_at             timestamptz not null default now(),
  unsubscribe_token_hash text not null
);

-- =========================================================
-- Matches & interests
-- =========================================================
create table public.matches (
  id                 uuid primary key default gen_random_uuid(),
  seeker_id          uuid not null references public.seekers(id) on delete cascade,
  pin_id             uuid not null references public.pins(id) on delete cascade,
  created_at         timestamptz not null default now(),
  seeker_notified_at timestamptz,
  owner_notified_at  timestamptz,
  unique (seeker_id, pin_id)
);

create table public.interests (           -- "I'm interested in this flat"
  id                uuid primary key default gen_random_uuid(),
  pin_id            uuid not null references public.pins(id) on delete cascade,
  email             text not null,
  phone             text,
  note              text check (char_length(note) <= 300),
  consent_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  owner_notified_at timestamptz,
  unique (pin_id, email)
);

-- =========================================================
-- Reports
-- =========================================================
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  pin_id        uuid not null references public.pins(id) on delete cascade,
  reporter_hash text not null,
  reason        text check (reason in ('fake_rent', 'broker', 'rented_out', 'spam', 'other')),
  created_at    timestamptz not null default now(),
  unique (pin_id, reporter_hash)
);

-- =========================================================
-- To-Let boards
-- =========================================================
create table public.tolet_boards (
  id                uuid primary key default gen_random_uuid(),
  photo_path        text not null,          -- private bucket: tolet/pending/<id>.jpg
  public_photo_path text,                   -- set on approval: tolet-public/<id>.jpg
  phone_text        text check (char_length(phone_text) <= 20),
  note              text check (char_length(note) <= 150),
  location          extensions.geography(point, 4326) not null,
  spotter_name      text check (char_length(spotter_name) <= 40),
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'gone')),
  gone_reports      integer not null default 0,
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz
);
create index tolet_location_gix on public.tolet_boards using gist (location);

-- =========================================================
-- Rate limits & admins
-- =========================================================
create table public.rate_limits (
  key          text not null,               -- hashed ip or hashed browser id
  action       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, action, window_start)
);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- =========================================================
-- RLS: enable everywhere, NO policies (service role bypasses RLS)
-- =========================================================
alter table public.pins            enable row level security;
alter table public.pin_contacts    enable row level security;
alter table public.seekers         enable row level security;
alter table public.seeker_contacts enable row level security;
alter table public.matches         enable row level security;
alter table public.interests       enable row level security;
alter table public.reports         enable row level security;
alter table public.tolet_boards    enable row level security;
alter table public.rate_limits     enable row level security;
alter table public.admins          enable row level security;

-- =========================================================
-- Public views (the ONLY data anon can read)
-- Note: these intentionally run with owner rights (not security_invoker)
-- so they can read the underlying RLS-locked tables. They expose only safe columns.
-- =========================================================
create view public.public_pins with (security_barrier) as
select
  id, kind, property_type, bhk, rent, furnishing, gated, maintenance_incl,
  deposit_months, sqft, parking_cars, society_name, occupants, pets_allowed,
  waterlogging, water_supply, power_backup, pg_meals, pg_gender,
  available_from, tenant_pref, room_gender_pref, room_smoking_ok, room_food_pref,
  one_liner, locality_slug, is_outlier, created_at,
  extensions.st_y(location::extensions.geometry) as lat,
  extensions.st_x(location::extensions.geometry) as lng
from public.pins
where status = 'active'
  and report_count < 3
  and (listing_expires_at is null or listing_expires_at > now());

create view public.public_tolet with (security_barrier) as
select id, public_photo_path, phone_text, note, spotter_name, created_at,
       extensions.st_y(location::extensions.geometry) as lat,
       extensions.st_x(location::extensions.geometry) as lng
from public.tolet_boards
where status = 'approved' and gone_reports < 3;

create view public.public_seeker_dots with (security_barrier) as
select id, looking_for, bhk_pref,
       round(extensions.st_y(location::extensions.geometry)::numeric, 2) as lat,   -- ~1 km blur
       round(extensions.st_x(location::extensions.geometry)::numeric, 2) as lng
from public.seekers
where status = 'active' and expires_at > now();

create view public.public_stats_city with (security_barrier) as
select bhk, property_type, gated,
       count(*) as n,
       percentile_cont(0.5) within group (order by rent) as median_rent
from public.pins
where status = 'active' and not is_outlier and report_count < 3
group by bhk, property_type, gated
having count(*) >= 3;

create view public.public_stats_locality with (security_barrier) as
select locality_slug, bhk,
       count(*) as n,
       percentile_cont(0.5) within group (order by rent) as median_rent,
       round(100.0 * avg((waterlogging = 'enters_premises')::int), 0) as pct_waterlog_severe,
       max(created_at) as last_pin_at
from public.pins
where status = 'active' and not is_outlier and report_count < 3
  and locality_slug is not null
group by locality_slug, bhk
having count(*) >= 3;

-- =========================================================
-- Functions
-- =========================================================

-- Area stats for a drawn rectangle (public)
create or replace function public.area_stats(min_lng float8, min_lat float8, max_lng float8, max_lat float8)
returns table (bhk smallint, n bigint, median_rent float8)
language sql stable security definer set search_path = public, extensions as $$
  select p.bhk, count(*), percentile_cont(0.5) within group (order by p.rent)
  from public.pins p
  where p.status = 'active' and not p.is_outlier and p.report_count < 3
    and p.location::geometry && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  group by p.bhk
  having count(*) >= 3;
$$;

-- Report counter trigger
create or replace function public.bump_report_count() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.pins set report_count = report_count + 1 where id = new.pin_id;
  return new;
end $$;
create trigger reports_bump after insert on public.reports
for each row execute function public.bump_report_count();

-- Rate limit (service role only)
create or replace function public.hit_rate_limit(p_key text, p_action text, p_limit int, p_window interval)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  w timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01');
  c int;
begin
  insert into public.rate_limits (key, action, window_start, count)
  values (p_key, p_action, w, 1)
  on conflict (key, action, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into c;
  return c <= p_limit;
end $$;

-- Nightly outlier flagging (service role / cron only)
create or replace function public.flag_outliers() returns void
language sql security definer set search_path = public, extensions as $$
  with med as (
    select locality_slug, bhk,
           percentile_cont(0.5) within group (order by rent) as m, count(*) as n
    from public.pins where status = 'active'
    group by locality_slug, bhk
  )
  update public.pins p
  set is_outlier = (p.rent > 3 * med.m or p.rent < med.m / 3)
  from med
  where p.locality_slug is not distinct from med.locality_slug
    and p.bhk is not distinct from med.bhk
    and med.n >= 5;
$$;

-- Nightly matching (service role / cron only)
create or replace function public.run_matching() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare inserted integer;
begin
  insert into public.matches (seeker_id, pin_id)
  select s.id, p.id
  from public.seekers s
  join public.pins p on st_dwithin(s.location, p.location, s.radius_m)
  where s.status = 'active' and s.expires_at > now()
    and p.status = 'active' and p.report_count < 3 and not p.is_outlier
    and p.kind in ('listing_whole', 'listing_room')
    and (p.listing_expires_at is null or p.listing_expires_at > now())
    and p.rent <= s.budget * 1.10
    and (s.property_types is null or p.property_type = any (s.property_types))
    and (not s.needs_parking or p.parking_cars > 0)
    and (
      (s.looking_for = 'whole' and p.kind = 'listing_whole'
        and (s.bhk_pref is null or p.bhk = s.bhk_pref)
        and (p.tenant_pref is null or p.tenant_pref = 'any' or s.household is null
             or p.tenant_pref = s.household))
      or
      (s.looking_for = 'room' and p.kind = 'listing_room'
        and (p.room_gender_pref is null or p.room_gender_pref = 'any' or p.room_gender_pref = s.gender)
        and (p.room_smoking_ok is null or p.room_smoking_ok <> 'no' or s.smoker is distinct from 'yes')
        and (p.room_food_pref is null or p.room_food_pref <> 'veg' or s.food_pref = 'veg'))
    )
  on conflict (seeker_id, pin_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- Nightly cleanup & retention (service role / cron only)
create or replace function public.cleanup() returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  -- Expired listings become plain rent data (keeps the area data), contact deleted
  delete from public.pin_contacts c
  using public.pins p
  where c.pin_id = p.id and p.kind <> 'rent'
    and p.listing_expires_at is not null and p.listing_expires_at < now();

  update public.pins
  set kind = 'rent', listing_expires_at = null,
      available_from = null, tenant_pref = null,
      room_gender_pref = null, room_smoking_ok = null, room_food_pref = null
  where kind <> 'rent' and listing_expires_at is not null and listing_expires_at < now();

  -- Expired seekers: archive + delete contact
  update public.seekers set status = 'archived'
  where status = 'active' and expires_at < now();
  delete from public.seeker_contacts c
  using public.seekers s
  where c.seeker_id = s.id and s.status = 'archived';

  -- Archived pins lose their contact
  delete from public.pin_contacts c
  using public.pins p
  where c.pin_id = p.id and p.status = 'archived';

  -- Old interests & rate-limit rows
  delete from public.interests where created_at < now() - interval '60 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';
end $$;

-- =========================================================
-- Privileges (order matters: after all objects exist)
-- =========================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

-- Future objects must not be exposed by default
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;

-- What anon IS allowed
grant usage on schema public to anon, authenticated;
grant select on public.public_pins, public.public_tolet, public.public_seeker_dots,
                public.public_stats_city, public.public_stats_locality
  to anon, authenticated;
grant execute on function public.area_stats(float8, float8, float8, float8) to anon, authenticated;

-- Service role keeps full access (Edge Functions)
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- =========================================================
-- Storage buckets (SPEC §6.2)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('tolet', 'tolet', false),          -- pending uploads, private
       ('tolet-public', 'tolet-public', true)  -- approved photos only
on conflict (id) do nothing;
-- No storage policies for anon. Uploads use signed upload URLs issued by `tolet-upload-url`.
-- Approval (admin-review) copies tolet/pending/<id>.jpg -> tolet-public/<id>.jpg.
