# Guwahati Rent Map — Complete Build Spec (v2)

> **Working name:** guwahati-rent (domain TBD, e.g. `guwahatirent.in`)
> **Status:** Pre-MVP. This file is the single source of truth for scope, stack, schema, security and build order.
> **v2 changes:** fixed Supabase SQL gotchas (extensions schema, search_path, function privileges, default privileges), added missing tables (rate_limits, interests, admins), missing Edge Functions (edit-seeker, express-interest, tolet-upload-url, unsubscribe, admin-review), storage buckets, CORS for functions, cleanup/retention job, ops (backups, keep-alive, nightly rebuild), acceptance criteria per phase.
> **Honesty note:** the SQL and code in this file were written carefully but have NOT been executed. Expect small errors on first run. The security gate in Phase 0 exists to catch the ones that matter.

---

## 0. Instructions for the AI coding agent (read first)

1. **Work one phase at a time.** Do not start the next phase until the human says so.
2. **At the end of every phase, stop and report:**
   - files created/changed
   - commands you ran **with their actual output**
   - what you could not test and why
   - anything in this spec you deviated from, and why
3. **Stack is fixed:** Vite + vanilla TypeScript. **Do not install React, Vue, Svelte, Next.js or any UI framework.** Vite is the build tool and stays.
4. **Do not add dependencies** beyond the list in §16 without asking. Justify each addition.
5. **Security rules in §5 are absolute.** If a permission error blocks you, **stop and ask** — never loosen RLS, grants or policies to make an error go away.
6. **Never claim something is tested unless you ran it and show the output.**
7. Tasks marked **[HUMAN]** are manual (accounts, keys, DNS, uploads). Do not attempt them; list them as blockers if you need them.
8. If this spec is ambiguous or wrong, say so and propose a fix instead of guessing silently.

---

## 1. Product

An anonymous, crowdsourced rent map for Guwahati.

1. **Renters** drop a pin with what they actually pay. No login.
2. **Owners** list a whole flat or a room directly. No broker, no fee.
3. **Seekers** drop a pin with budget + preferences; a nightly job matches them with listings nearby and sends both sides one daily digest email.
4. **Anyone** can photograph a To-Let board and put it on the map (admin-approved).
5. **Guwahati-specific data on every pin:** monsoon waterlogging, water supply, power backup.

**Positioning:** broker-quoted prices on portals are inflated; real rents from real renters are the truth. Free, no login, no broker.

**Non-goals (do not build):** accounts for users, chat, payments, comments, ratings, mobile app, AI features, satellite layer, metro layer, any community/religion/caste filter.

### Context (why these choices)
- Modeled on bengaluru.rent (single static HTML page + Supabase + Resend, ~6k rent pins, ~185k visitors in ~5 months, grew via area SEO pages and WhatsApp sharing). Copy the **concept**, not their code, design or copy — their terms claim those.
- Guwahati differs: much lower rents (2 BHK often ₹10–20k), smaller online rental market (~1–2k live portal listings), much renting happens offline via word of mouth and To-Let boards, no metro, monsoon waterlogging is a top concern.
- Therefore: To-Let boards are a primary supply source, waterlogging is the headline differentiator, PG/1RK are first-class types (large student demand), and cost must stay ~₹0.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Build tool | **Vite** (multi-page) | `vanilla-ts` template |
| Frontend | **Vanilla TypeScript** | Native `<dialog>`, `<form>`, `FormData`, `<template>` |
| Map renderer | **MapLibre GL JS** | Lazy-loaded; only on the map page |
| Basemap | **Protomaps PMTiles** Guwahati extract on **Cloudflare R2** | No API key, no per-load billing |
| Database | **Supabase Postgres + PostGIS** | Free tier, region ap-south-1 (Mumbai) |
| Server logic | **Supabase Edge Functions** (Deno/TS) | **All writes** go through these |
| Scheduled jobs | **pg_cron** + **pg_net** | Matching, outliers, cleanup, digests |
| Email | **Resend** free (100/day, 3,000/month) | One digest per person per day; hard cap 95/day |
| Spam protection | **Cloudflare Turnstile** | Every public form; verified server-side |
| Validation | **Zod** | Shared schemas frontend ↔ functions |
| Hosting | **Netlify** (account separate from portfolio) or Cloudflare Pages | Static output |
| Analytics | Cloudflare Web Analytics or Umami | Cookie-free |
| Error monitoring (optional) | Sentry free tier | Add in Phase 4 if wanted |
| Ops automation | **GitHub Actions** | Backups, keep-alive, nightly rebuild |

---

## 3. Folder structure

```
guwahati-rent/
├── index.html                      # map app
├── about.html
├── privacy.html
├── terms.html
├── unsubscribe.html                # POSTs token on button click (never auto-unsubscribe on GET)
├── admin.html                      # To-Let review (Supabase Auth, admins only)
├── src/
│   ├── main.ts                     # boot
│   ├── map.ts                      # MapLibre + PMTiles
│   ├── layers.ts                   # layer styles
│   ├── filters.ts                  # filter state -> map filters + list view
│   ├── state.ts                    # tiny store: getState/setState/subscribe
│   ├── api.ts                      # ALL network calls (views, rpc, functions)
│   ├── schemas.ts                  # Zod schemas
│   ├── tokens.ts                   # edit tokens + reporter id in localStorage
│   ├── localities.ts               # loads localities.json, nearest-locality helper
│   ├── ui/
│   │   ├── dialog.ts
│   │   ├── pin-card.ts
│   │   ├── list-view.ts            # accessible table view
│   │   ├── stats.ts
│   │   ├── placement.ts            # "tap the map to place" mode
│   │   ├── turnstile.ts
│   │   └── toast.ts
│   ├── forms/
│   │   ├── rent-pin.ts
│   │   ├── listing.ts
│   │   ├── seeker.ts
│   │   ├── interest.ts
│   │   └── tolet.ts
│   ├── pages/
│   │   ├── unsubscribe.ts
│   │   └── admin.ts
│   └── styles/main.css
├── scripts/
│   └── build-localities.ts         # runs AFTER vite build, writes into dist/
├── templates/
│   └── locality.html
├── public/
│   ├── localities.json
│   ├── og-default.png
│   └── robots.txt
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   └── 0002_cron.sql
│   └── functions/
│       ├── _shared/
│       │   ├── cors.ts
│       │   ├── turnstile.ts
│       │   ├── crypto.ts
│       │   ├── ratelimit.ts
│       │   ├── geo.ts
│       │   ├── supabase.ts
│       │   └── schemas.ts
│       ├── submit-pin/
│       ├── submit-seeker/
│       ├── edit-pin/
│       ├── edit-seeker/
│       ├── report-pin/
│       ├── express-interest/
│       ├── tolet-upload-url/
│       ├── submit-tolet/
│       ├── admin-review/
│       ├── unsubscribe/
│       └── send-digests/
├── .github/workflows/
│   ├── backup.yml
│   ├── keepalive.yml
│   └── nightly-rebuild.yml
├── netlify.toml
├── .env.example
├── .gitignore                      # MUST include .env
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. Environment variables & secrets

```bash
# .env — frontend (public by design; still never commit the file)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_TURNSTILE_SITE_KEY=
VITE_TILES_URL=https://<r2-public-url-or-domain>/guwahati.pmtiles
VITE_SITE_URL=http://localhost:5173
```

```bash
# Supabase Edge Function secrets — set via `npx supabase secrets set ...`
# NEVER in frontend, NEVER in a VITE_ variable, NEVER committed
TURNSTILE_SECRET_KEY=
RESEND_API_KEY=
EMAIL_FROM="Guwahati Rent <hi@<domain>>"
SITE_URL=https://<domain>
HASH_SALT=<long random string>          # for hashing IPs / reporter ids
ALLOWED_ORIGINS=http://localhost:5173,https://<domain>
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically in Edge Functions
```

```bash
# GitHub Actions secrets
SUPABASE_URL, SUPABASE_ANON_KEY          # keep-alive
SUPABASE_DB_URL                          # backup (Session pooler connection string)
NETLIFY_BUILD_HOOK_URL                   # nightly rebuild
```

---

## 5. Security rules (absolute — never break, even to fix an error)

1. **Anon must never read email or phone.** Contacts live in separate tables; RLS on with no policies; not referenced by any public view.
2. **Anon has no INSERT/UPDATE/DELETE on any table.** All writes go through Edge Functions using the service role.
3. **Anon can only `SELECT` from the public views and `EXECUTE` `area_stats()`.** Every other function (matching, outliers, cleanup, rate limit) is revoked from anon/authenticated/public.
4. **Never disable RLS. Never create a policy with `using (true)`.** If blocked, stop and ask.
5. **Service role key never appears in frontend code, `VITE_` vars, or git.** If it leaks: rotate immediately.
6. **Every public form is protected by Turnstile**, verified server-side before any DB write.
7. **Coordinates are rounded to 3 decimals (~100 m) server-side** before storage.
8. **Edit/delete uses a secret token**, not IP: random token on create, store only SHA-256 hash, plain token in creator's localStorage.
9. **No community/religion/caste/ethnicity fields or filters. Ever.**
10. **Medians, not averages**, for all rent stats. No stats shown from fewer than 3 pins.
11. **Max one digest email per person per day. Hard cap 95 emails/day total** (free tier is 100). Never CC ourselves.
12. **Contact data is only shared with matched/interested parties, with explicit consent checkbox.**
13. **Never scrape other portals. Never invent seed data.**
14. **Pins render via one GeoJSON source + MapLibre layers.** Never `new maplibregl.Marker()` per pin.
15. **Unsubscribe links open a page with a button that POSTs.** Never unsubscribe on GET (email scanners prefetch links).

---

## 6. Database

### 6.1 `supabase/migrations/0001_init.sql`

```sql
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
```

### 6.2 Storage (run in `0001_init.sql` or dashboard)

```sql
insert into storage.buckets (id, name, public)
values ('tolet', 'tolet', false),          -- pending uploads, private
       ('tolet-public', 'tolet-public', true)  -- approved photos only
on conflict (id) do nothing;
-- No storage policies for anon. Uploads use signed upload URLs issued by `tolet-upload-url`.
-- Approval (admin-review) copies tolet/pending/<id>.jpg -> tolet-public/<id>.jpg.
```

### 6.3 `supabase/migrations/0002_cron.sql`

**[HUMAN] prerequisites:** enable `pg_cron` and `pg_net` in Dashboard → Database → Extensions. Then store the service role key in Vault once via SQL editor (never in a migration file):
```sql
select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
```

```sql
-- Times are UTC. IST = UTC + 5:30.
select cron.schedule('flag-outliers', '0 20 * * *',  $$select public.flag_outliers()$$);  -- 01:30 IST
select cron.schedule('run-matching',  '30 20 * * *', $$select public.run_matching()$$);   -- 02:00 IST
select cron.schedule('cleanup',       '0 21 * * *',  $$select public.cleanup()$$);        -- 02:30 IST

-- Digests at 09:00 IST
select cron.schedule('send-digests', '30 3 * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/send-digests',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
$$);
```

---

## 7. Edge Functions

### 7.1 Common pattern (every public function)

1. Handle CORS preflight (`OPTIONS`) → allow only `ALLOWED_ORIGINS`.
2. Parse JSON; validate with Zod → 400 on failure.
3. Verify Turnstile token → 403 on failure.
4. Rate limit: `hit_rate_limit(sha256(ip + HASH_SALT), action, limit, window)` **and** same for browser id → 429 on failure.
5. Do the work with a **service-role** client.
6. Return `{ ok: true, ...data }` or `{ ok: false, error: '<human-readable>' }`. Never leak stack traces.

### 7.2 Shared helpers (`supabase/functions/_shared/`)

```ts
// cors.ts
const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim());
export function corsHeaders(origin: string | null) {
  const o = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
```

```ts
// turnstile.ts
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const body = new FormData();
  body.append('secret', Deno.env.get('TURNSTILE_SECRET_KEY')!);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = await res.json();
  return data.success === true;
}
```

```ts
// crypto.ts
export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]!));
}
export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}
```

```ts
// geo.ts
export const BBOX = { minLng: 91.55, minLat: 26.05, maxLng: 91.95, maxLat: 26.25 };
export const inGuwahati = (lat: number, lng: number) =>
  lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const toWkt = (lat: number, lng: number) => `SRID=4326;POINT(${round3(lng)} ${round3(lat)})`;

// nearest locality within 3 km (localities copied from public/localities.json into _shared/localities.ts)
export function nearestLocality(lat: number, lng: number, list: { slug: string; lat: number; lng: number }[]) {
  let best: string | null = null, bestD = Infinity;
  for (const l of list) {
    const d = haversineM(lat, lng, l.lat, l.lng);
    if (d < bestD) { bestD = d; best = l.slug; }
  }
  return bestD <= 3000 ? best : null;
}
function haversineM(a: number, b: number, c: number, d: number) {
  const R = 6371000, toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(c - a), dLng = toR(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
```

### 7.3 Function contracts

| Function | Input | Behaviour | Rate limit | Returns |
|---|---|---|---|---|
| `submit-pin` | pin fields, `lat`, `lng`, `turnstileToken`, `browserId`; for listings also `email`, `phone`, `consent: true` | Validate plausibility band (§10) → bbox check → round coords → nearest locality → `editToken = randomToken()` → insert `pins` (listings get `listing_expires_at = now()+45d`) → if listing insert `pin_contacts` with `unsubscribe_token_hash` | 5/day | `{ id, editToken }` |
| `submit-seeker` | seeker fields, `lat`, `lng`, `email`, `phone`, `consent: true`, `turnstileToken`, `browserId` | Same pattern → insert `seekers` + `seeker_contacts`. If same email has active seekers, return them so UI can offer to archive old ones. | 3/day | `{ id, editToken }` |
| `edit-pin` | `id`, `editToken`, `action: 'update' \| 'delete' \| 'mark_rented' \| 'renew'`, fields | `sha256(editToken)` must equal stored hash. `delete` → status archived. `mark_rented` → convert to rent pin, delete contact. `renew` → extend listing 45 days. | 30/day | `{ ok }` |
| `edit-seeker` | `id`, `editToken`, `action: 'update' \| 'delete' \| 'extend'` | Same token check. `delete` → archive + delete contact immediately. | 30/day | `{ ok }` |
| `report-pin` | `pinId`, `reason`, `browserId`, `turnstileToken` | Insert into `reports` with `reporter_hash = sha256(browserId + HASH_SALT)`; unique per reporter | 10/day | `{ ok }` |
| `express-interest` | `pinId`, `email`, `phone?`, `note?`, `consent: true`, `turnstileToken`, `browserId` | Pin must be active listing → insert `interests` (unique pin+email) → owner gets it in next digest | 10/day | `{ ok }` |
| `tolet-upload-url` | `turnstileToken`, `browserId` | Create `tolet_boards` id; return signed upload URL for `tolet/pending/<id>.jpg` (expires 10 min) | 5/day | `{ boardId, uploadUrl, token }` |
| `submit-tolet` | `boardId`, `lat`, `lng`, `phoneText?`, `note?`, `spotterName?`, `browserId` | Verify object exists in storage → bbox check → insert/update `tolet_boards` status `pending` | 5/day | `{ ok }` |
| `admin-review` | `Authorization: Bearer <user JWT>`, `boardId`, `decision: 'approve' \| 'reject'` | `auth.getUser(jwt)` → user id must exist in `admins` → approve: copy to `tolet-public/<id>.jpg`, set `public_photo_path`, status approved; reject: delete object, status rejected. Also `GET`-style list action returns pending boards with short-lived signed URLs. | — | `{ ok }` |
| `unsubscribe` | `token` (POST only) | Look up `sha256(token)` in `pin_contacts` / `seeker_contacts` → archive that pin/seeker → delete contact | 20/day | `{ ok, what: 'listing' \| 'seeker' }` |
| `send-digests` | none; **reject unless Authorization is the service role key** | See §7.4 | — | `{ sent, deferred }` |

### 7.4 `send-digests` logic

1. Collect recipients with pending items:
   - **Seekers**: `matches` where `seeker_notified_at is null` → list of matched listings with owner email/phone.
   - **Owners**: `matches` where `owner_notified_at is null` → list of matched seekers with their email/phone; plus `interests` where `owner_notified_at is null`.
2. Group by recipient email → **one email per recipient**.
3. Order recipients: oldest pending item first. **Stop at 95 sent**; remaining stay pending for tomorrow.
4. Each email: plain, short, mobile-friendly; every item shows the other party's contact; footer has unsubscribe link `SITE_URL/unsubscribe.html?t=<token>` and "delete your pin" instructions.
5. After a successful send, set the relevant `*_notified_at = now()`. On failure, leave pending.
6. Return `{ sent, deferred }`. Log counts only — never log email addresses or phones.

**Unsubscribe tokens:** generated at submission time (`randomToken()`); only the hash is stored. Because the plain token isn't stored, `send-digests` can't rebuild the link. Therefore: **generate a fresh unsubscribe token per digest**, update `unsubscribe_token_hash` to its hash, and put the fresh token in the email (latest email's link always works).

### 7.5 Email copy (starting point)

**Seeker digest subject:** `3 flats match your search near Beltola`
```
Hi,

These listings near your pin match your budget and preferences:

• 2 BHK, semi-furnished, ₹14,000 — Survey, Beltola
  Owner: owner@email.com · 98XXXXXXXX
  "Near Beltola bazaar, 24x7 water"

Contact owners directly. No broker, no fee.
Please verify the flat in person before paying anything.

Found a place? Delete your pin: <SITE_URL>
Stop these emails: <unsubscribe link>
```

**Owner digest subject:** `2 people are interested in your flat`
```
Hi,

These people are looking for a place like yours:

• Looking for a 2 BHK up to ₹15,000 — family
  seeker@email.com · 97XXXXXXXX

Rented it out? Mark it as rented: open your pin on <SITE_URL> on the device you listed from.
Stop these emails: <unsubscribe link>
```

---

## 8. Frontend

### 8.1 Vite multi-page config

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        unsubscribe: resolve(__dirname, 'unsubscribe.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
```

`package.json` scripts:
```json
{
  "dev": "vite",
  "build": "vite build && tsx scripts/build-localities.ts",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit"
}
```
(Localities are generated **after** `vite build` because Vite empties `dist/`.)

### 8.2 Map (`src/map.ts`)

```ts
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps'; // VERIFY against installed version's README

export const GUWAHATI_CENTER: [number, number] = [91.7362, 26.1445];

export function createMap(container: HTMLElement) {
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  const map = new maplibregl.Map({
    container,
    center: GUWAHATI_CENTER,
    zoom: 12,
    minZoom: 10,
    maxBounds: [[91.4, 25.95], [92.1, 26.35]],
    style: {
      version: 8,
      glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf', // self-host before launch
      sources: {
        base: {
          type: 'vector',
          url: `pmtiles://${import.meta.env.VITE_TILES_URL}`,
          attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
      layers: layers('base', namedFlavor('light'), { lang: 'en' }),
    },
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.GeolocateControl({}), 'bottom-right');
  return map;
}
```

### 8.3 Sources & layers (`src/layers.ts`)

| Source | Type | Layers |
|---|---|---|
| `pins` | GeoJSON, `cluster: true`, `clusterRadius: 40`, `clusterMaxZoom: 15`, `clusterProperties: { rentSum: ['+', ['get', 'rent']] }` | `clusters` (circle, size by count), `cluster-label` ("n · ₹avg" where avg = rentSum/point_count, formatted as ₹14k), `pin-rent` (circle; fill by `gated`; stroke by `kind`), `pin-label` (symbol "₹14k", zoom ≥ 14) |
| `waterlog` | GeoJSON (pins with waterlogging ≠ unknown) | `waterlog-heat` (heatmap; weight: none=0, road_only=0.5, enters_premises=1); hidden by default, toggle button |
| `tolet` | GeoJSON from `public_tolet` | `tolet-icon` (symbol/circle, distinct shape + label "To-Let") |
| `seekers` | GeoJSON from `public_seeker_dots` | `seeker-dots` (faint circles); visible only in "Flat Hunt" mode |

Filters rebuild the `pins` source data from the in-memory array (so cluster counts reflect filters). Never one DOM marker per pin.

### 8.4 Data loading (`src/api.ts`)

- Reads: Supabase JS client with anon key → `public_pins`, `public_tolet`, `public_seeker_dots`, `public_stats_*`, `rpc('area_stats')`.
- Writes: `supabase.functions.invoke('<name>', { body })` only.
- Load all pins once on boot (fine up to ~20k rows). Cache in memory.
- `?area=<slug>` URL param → fly to that locality on load.

### 8.5 Dialogs (native `<dialog>` in `index.html`)

| Dialog | Purpose |
|---|---|
| `#dlg-welcome` | First visit: what this is, consent to privacy/terms (remember in localStorage) |
| `#dlg-add` | Pin my rent / List my flat / I'm looking / Spot a To-Let |
| `#dlg-rent-pin` | Rent pin form |
| `#dlg-listing` | Whole flat / room listing (+ consent checkbox) |
| `#dlg-seeker` | Seeker form (+ consent checkbox) |
| `#dlg-interest` | "I'm interested" form (+ consent checkbox) |
| `#dlg-tolet` | Photo → location → phone on board |
| `#dlg-pin` | Pin details, interested, report, edit/delete/mark rented (if token in localStorage) |
| `#dlg-filters` | Filters |
| `#dlg-stats` | City + locality medians |
| `#dlg-shared` | After submit: WhatsApp share (`https://wa.me/?text=<encoded>`) + copy link |

**Placement flow:** Add → choose type → map enters placement mode (crosshair, banner "Tap where the flat is", Cancel button) → tap → dialog opens with lat/lng prefilled → submit → pin appears, token saved, share dialog.

### 8.6 Accessibility (WCAG 2.2 AA target)

- Native `<dialog>`; `aria-labelledby` heading; focus to first field; focus returns to trigger on close; Esc closes.
- **List view** (`src/ui/list-view.ts`): toggle "Map / List". Same filtered data as a `<table>` with `<caption>`, sortable column headers (`aria-sort`), locality, type, BHK, rent, furnishing, waterlogging, date. Required: map is unusable with screen readers and slow on low-end phones.
- All form fields have visible `<label>`s; errors linked with `aria-describedby`; don't rely on colour alone.
- Touch targets ≥ 44×44 px. Respect `prefers-reduced-motion` (no fly-to animations).
- Map container has `aria-label` and a visible hint that the list view exists.

### 8.7 Rent-pin form fields

Required: property type, BHK (hidden for room/PG → 0), monthly rent (₹), furnishing, gated (yes/no), parking cars (0+), society/building name (optional for independent houses).
Optional: maintenance included, deposit months, sqft, occupants (family/bachelor), pets, **waterlogging**, **water supply**, **power backup**, PG meals/gender (PG only), one-liner (150 chars).

### 8.8 Performance budget

- Map page JS (excluding MapLibre) < 60 KB gzipped.
- MapLibre loaded via dynamic `import()` after first paint.
- Photos compressed client-side to ≤ 150 KB, max 1280 px (`browser-image-compression`).
- Lighthouse mobile: Performance ≥ 80, Accessibility ≥ 95.

---

## 9. Filters

Type (rent data / whole flat available / room available / To-Let) · BHK (1RK, 1, 2, 3, 4+) · rent range · furnishing · gated · property type (flat / independent / PG / 1RK) · hide "waterlogging enters premises" · posted within (30 / 90 / 180 days / all).

Filter state is reflected in the URL query string so filtered views are shareable.

---

## 10. Plausibility bands (reject outside; starting guesses — re-tune after ~300 real pins)

| Type | Min ₹ | Max ₹ |
|---|---|---|
| Room / PG bed (`bhk = 0`, type room/pg) | 1,500 | 30,000 |
| 1RK / studio | 2,000 | 20,000 |
| 1 BHK | 3,000 | 45,000 |
| 2 BHK | 5,000 | 90,000 |
| 3 BHK | 7,000 | 1,50,000 |
| 4+ BHK | 10,000 | 3,00,000 |

Rent > 2× locality median (when ≥ 5 pins exist): show "Double-check this rent?" confirm step before submit.

---

## 11. Localities — `public/localities.json`

**Approximate centres. [HUMAN] must verify each on the map before launch.** Copy the same list into `supabase/functions/_shared/localities.ts`.

```json
[
  { "slug": "beltola",      "name": "Beltola",      "lat": 26.121, "lng": 91.797 },
  { "slug": "survey",       "name": "Survey",       "lat": 26.128, "lng": 91.792 },
  { "slug": "six-mile",     "name": "Six Mile",     "lat": 26.128, "lng": 91.810 },
  { "slug": "khanapara",    "name": "Khanapara",    "lat": 26.118, "lng": 91.826 },
  { "slug": "kahilipara",   "name": "Kahilipara",   "lat": 26.131, "lng": 91.763 },
  { "slug": "zoo-road",     "name": "Zoo Road",     "lat": 26.168, "lng": 91.776 },
  { "slug": "dispur",       "name": "Dispur",       "lat": 26.143, "lng": 91.790 },
  { "slug": "ganeshguri",   "name": "Ganeshguri",   "lat": 26.149, "lng": 91.785 },
  { "slug": "hatigaon",     "name": "Hatigaon",     "lat": 26.130, "lng": 91.781 },
  { "slug": "rukminigaon",  "name": "Rukminigaon",  "lat": 26.140, "lng": 91.800 },
  { "slug": "gs-road",      "name": "GS Road",      "lat": 26.155, "lng": 91.778 },
  { "slug": "chandmari",    "name": "Chandmari",    "lat": 26.183, "lng": 91.766 },
  { "slug": "silpukhuri",   "name": "Silpukhuri",   "lat": 26.188, "lng": 91.755 },
  { "slug": "uzan-bazar",   "name": "Uzan Bazar",   "lat": 26.193, "lng": 91.753 },
  { "slug": "paltan-bazar", "name": "Paltan Bazar", "lat": 26.176, "lng": 91.752 },
  { "slug": "fancy-bazar",  "name": "Fancy Bazar",  "lat": 26.184, "lng": 91.742 },
  { "slug": "lachit-nagar", "name": "Lachit Nagar", "lat": 26.170, "lng": 91.763 },
  { "slug": "ulubari",      "name": "Ulubari",      "lat": 26.170, "lng": 91.758 },
  { "slug": "bamunimaidam", "name": "Bamunimaidam", "lat": 26.190, "lng": 91.787 },
  { "slug": "noonmati",     "name": "Noonmati",     "lat": 26.198, "lng": 91.797 },
  { "slug": "narengi",      "name": "Narengi",      "lat": 26.185, "lng": 91.830 },
  { "slug": "lalganesh",    "name": "Lalganesh",    "lat": 26.150, "lng": 91.740 },
  { "slug": "maligaon",     "name": "Maligaon",     "lat": 26.160, "lng": 91.700 },
  { "slug": "adabari",      "name": "Adabari",      "lat": 26.170, "lng": 91.708 },
  { "slug": "jalukbari",    "name": "Jalukbari",    "lat": 26.155, "lng": 91.664 },
  { "slug": "garchuk",      "name": "Garchuk",      "lat": 26.115, "lng": 91.713 },
  { "slug": "lokhra",       "name": "Lokhra",       "lat": 26.105, "lng": 91.770 },
  { "slug": "bhetapara",    "name": "Bhetapara",    "lat": 26.113, "lng": 91.781 },
  { "slug": "basistha",     "name": "Basistha",     "lat": 26.105, "lng": 91.795 },
  { "slug": "jorabat",      "name": "Jorabat",      "lat": 26.108, "lng": 91.867 }
]
```

---

## 12. SEO pages — `scripts/build-localities.ts`

Runs after `vite build`, writes into `dist/`.

For each locality with rows in `public_stats_locality` (i.e. ≥ 3 pins per BHK; only generate the page if total pins ≥ 5):
- `dist/<slug>/index.html` from `templates/locality.html`:
  - `<title>Rent in {{name}}, Guwahati — real 1, 2 & 3 BHK rents | {{brand}}</title>`
  - `<meta name="description">` with real medians: "2 BHK median ₹{{m2}}/month from {{n}} renters in {{name}}. No brokers, no login."
  - Canonical, OG title/description/image (WhatsApp previews depend on these).
  - Stats table by BHK, % severe waterlogging, pin count, "updated {{date}}".
  - Links to 4 nearest localities; CTA "Open {{name}} on the map" → `/?area={{slug}}`; CTA "Pin your rent".
- Also generate: `/rent-in-guwahati/`, `/1-bhk-for-rent-guwahati/`, `/2-bhk-for-rent-guwahati/`, `/3-bhk-for-rent-guwahati/`, `/pg-in-guwahati/`, `/flats-without-broker-guwahati/`, `sitemap.xml`.
- Localities without enough data: **no page** (thin pages hurt).

---

## 13. Privacy & Terms (content requirements — [HUMAN] get wording reviewed under India's DPDP Act before launch)

**Privacy must state:**
- Rent pin data is public (amount, BHK, approx. location rounded ~100 m, optional details). No login, no name.
- Email/phone (listings, seekers, interests) are **never shown on the map**; shared **only** with people whose pins match or who express interest, via email; explicit consent checkbox.
- IPs and browser ids are stored only as salted hashes for spam prevention.
- Retention: seekers 30 days, listings 45 days (renewable), contacts deleted when pin expires/is deleted/unsubscribed, interests 60 days.
- Deletion: delete via edit token on the same device; unsubscribe link in every email; full deletion by emailing hi@<domain>.
- Once a contact is shared in a match email, the recipient has it — we can't recall it.
- Third parties: Supabase (DB), Resend (email), Cloudflare (Turnstile, R2, analytics), Netlify (hosting), OpenStreetMap (map data).
- No data sold. No brokers. No ads (for now).

**Terms must state:** user-reported, unverified data; no warranty; prohibited content (fake rents, broker listings posing as owners, discriminatory listings, harassment); reports hide content at 3 strikes; we can remove anything; verify flats in person and never pay before seeing the property.

---

## 14. Ops

### 14.1 Backups — `.github/workflows/backup.yml`
Free tier has no backups.
```yaml
name: weekly-backup
on:
  schedule: [{ cron: '0 22 * * 0' }]   # Sunday 03:30 IST
  workflow_dispatch:
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - run: |
          mkdir -p backups
          pg_dump "${{ secrets.SUPABASE_DB_URL }}" --no-owner --schema=public -Fc -f backups/db-$(date +%F).dump
      - uses: actions/upload-artifact@v4
        with: { name: db-backup, path: backups/, retention-days: 90 }
```
(Artifacts avoid committing personal data into git. Match `postgresql-client` major version to the Supabase Postgres version if pg_dump complains.)

### 14.2 Keep-alive — `.github/workflows/keepalive.yml`
Free projects pause after ~7 days without activity.
```yaml
name: keepalive
on:
  schedule: [{ cron: '0 6 */2 * *' }]
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sf "${{ secrets.SUPABASE_URL }}/rest/v1/public_stats_city?select=n&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

### 14.3 Nightly rebuild — `.github/workflows/nightly-rebuild.yml`
```yaml
name: nightly-rebuild
on:
  schedule: [{ cron: '0 22 * * *' }]    # 03:30 IST, after matching/cleanup
  workflow_dispatch:
jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - run: curl -sf -X POST -d '{}' "${{ secrets.NETLIFY_BUILD_HOOK_URL }}"
```

### 14.4 `netlify.toml`
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(self), geolocation=(self), microphone=()"
```

---

## 15. Phases, tasks & acceptance criteria

> Agent: complete one phase, run the checks, report (§0.2), then stop.

### Phase 0 — Setup, schema, security gate

**[HUMAN]** (see Appendix A for details)
- [ ] Supabase project (ap-south-1), enable PostGIS, pg_cron, pg_net
- [ ] Cloudflare account: Turnstile site (localhost + domain), R2 bucket `tiles` with CORS
- [ ] PMTiles Guwahati extract uploaded to R2
- [ ] `.env` filled; `.gitignore` contains `.env`

**Agent**
- [ ] Scaffold Vite vanilla-ts project, multi-page config, ESLint + Prettier, `typecheck` script
- [ ] Write `0001_init.sql` from §6.1 + storage from §6.2; write `0002_cron.sql` from §6.3
- [ ] `_shared/` helpers from §7.2
- [ ] `public/localities.json` from §11
- [ ] A script `scripts/security-check.sh` implementing the gate below

**Security gate (must pass before any UI work)**
1. [HUMAN] Insert test data in SQL editor:
   ```sql
   insert into pins (kind, bhk, rent, furnishing, location, edit_token_hash)
   values ('listing_whole', 2, 15000, 'semi', 'SRID=4326;POINT(91.797 26.121)', 'test');
   insert into pin_contacts (pin_id, email, phone, unsubscribe_token_hash)
   select id, 'leak-test@example.com', '9999999999', 'x' from pins limit 1;
   ```
2. Run with the **anon** key:
   ```bash
   URL="https://<ref>.supabase.co"; ANON="<anon-key>"
   H=(-H "apikey: $ANON" -H "Authorization: Bearer $ANON")
   curl -s "$URL/rest/v1/pin_contacts?select=*" "${H[@]}"                       # 1
   curl -s "$URL/rest/v1/pins?select=*" "${H[@]}"                               # 2
   curl -s "$URL/rest/v1/public_pins?select=*" "${H[@]}"                        # 3
   curl -s -X POST "$URL/rest/v1/pins" "${H[@]}" -H "Content-Type: application/json" \
        -d '{"kind":"rent","rent":5000}'                                         # 4
   curl -s -X POST "$URL/rest/v1/rpc/run_matching" "${H[@]}"                    # 5
   curl -s -X POST "$URL/rest/v1/rpc/cleanup" "${H[@]}"                         # 6
   curl -s -X POST "$URL/rest/v1/rpc/area_stats" "${H[@]}" -H "Content-Type: application/json" \
        -d '{"min_lng":91.5,"min_lat":26.0,"max_lng":92.0,"max_lat":26.3}'     # 7
   ```

| # | Pass | Fail → STOP |
|---|---|---|
| 1 | error or `[]` | `leak-test@example.com` visible |
| 2 | error or `[]` | rows visible |
| 3 | 1 row, no email/phone/edit_token_hash | empty/error |
| 4 | error | 201 Created |
| 5 | permission error | runs |
| 6 | permission error | runs |
| 7 | `[]` (fewer than 3 pins) — no permission error | permission error |

3. [HUMAN] Delete test rows.

### Phase 1 — Map + rent pins

**Agent**
- [ ] `map.ts`, `layers.ts` (pins source/clusters/labels)
- [ ] `api.ts` reads `public_pins`
- [ ] Placement mode + `#dlg-add` + `#dlg-rent-pin` + Turnstile widget
- [ ] `submit-pin` function (rent pins only for now)
- [ ] `tokens.ts`; `#dlg-pin` with delete for own pins; `edit-pin` (delete only for now)
- [ ] `#dlg-shared` with WhatsApp share
- [ ] `#dlg-welcome` with consent

**Acceptance (human verifies on a real phone)**
- [ ] Map shows Guwahati from PMTiles; no API keys; no console errors
- [ ] Pins cluster when zoomed out, show "₹14k" labels when zoomed in
- [ ] Add → Pin my rent → tap → form → submit → pin appears immediately
- [ ] Missing/invalid Turnstile → rejected
- [ ] Pin outside Guwahati → rejected with a clear message
- [ ] Rent outside plausibility band → rejected with a clear message
- [ ] After refresh, only my pin shows Delete; deleting works; tampered token fails
- [ ] Works on a mid-range Android over mobile data
- [ ] WhatsApp share opens with prefilled message and correct link

**[HUMAN] after Phase 1:** seed ~50 real pins from people you know before Phase 2.

### Phase 2 — Trust, stats, waterlogging, filters, list view

**Agent**
- [ ] Rate limiting in all existing functions
- [ ] `report-pin` + report UI; verify auto-hide at 3 reports
- [ ] Plausibility "double-check" step (§10)
- [ ] `#dlg-filters` + URL-synced filter state
- [ ] `#dlg-stats` (city + locality medians)
- [ ] Waterlogging heatmap + toggle; waterlogging/water/power fields in form
- [ ] `list-view.ts` accessible table
- [ ] `edit-pin` update action

**Acceptance**
- [ ] 6th pin from same device in 24h → rejected
- [ ] 3 reports from 3 different browsers → pin disappears
- [ ] Filters change both map and list; filtered URL reopens same view
- [ ] Stats never show a bucket with < 3 pins
- [ ] List view fully usable with keyboard only and with a screen reader (TalkBack or NVDA)
- [ ] Lighthouse accessibility ≥ 95

### Phase 3 — Listings, seekers, matching, digests

**[HUMAN]** domain bought + DNS on Cloudflare; Resend domain verified; `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` secrets set; Vault secrets created; `0002_cron.sql` applied.

**Agent**
- [ ] `#dlg-listing` (whole/room) with consent → `submit-pin` listing path + `pin_contacts`
- [ ] `#dlg-seeker` with consent → `submit-seeker`; duplicate-seeker handling
- [ ] Flat Hunt mode: seeker dots + listing highlight
- [ ] `edit-seeker`; `edit-pin` `mark_rented` + `renew`
- [ ] `#dlg-interest` → `express-interest`
- [ ] `send-digests` per §7.4 with 95/day cap and carry-over
- [ ] `unsubscribe.html` + `unsubscribe` function (POST only)

**Acceptance**
- [ ] Create listing + matching seeker (two browsers) → run `select run_matching();` → run `send-digests` manually → both receive **one** email each with each other's contact
- [ ] Non-matching seeker (budget too low / wrong BHK) → no match row
- [ ] Interest submitted → owner gets it in next digest
- [ ] Unsubscribe link → page → button → pin/seeker archived, contact row deleted, no further emails
- [ ] Opening the unsubscribe link without clicking the button changes nothing
- [ ] Simulate 120 pending recipients → 95 sent, 25 deferred, sent next run
- [ ] `cleanup()` converts expired listings to rent pins and deletes their contacts

### Phase 4 — To-Let boards, admin, SEO pages, launch

**[HUMAN]** create your admin user in Supabase Auth and insert its id into `admins`; Netlify site + custom domain + build hook; GitHub secrets for workflows; locality coordinates verified; privacy/terms reviewed.

**Agent**
- [ ] `#dlg-tolet`: camera/file input → compress → `tolet-upload-url` → upload → `submit-tolet`
- [ ] `tolet` layer + board detail (photo, "call number on board", "board gone" report)
- [ ] `admin.html`: email OTP login, pending list with photos, approve/reject via `admin-review`
- [ ] `build-localities.ts` + template + sitemap + robots
- [ ] `about.html`, `privacy.html`, `terms.html` (content per §13)
- [ ] GitHub workflows §14.1–14.3; `netlify.toml` §14.4
- [ ] Self-host map glyphs (and sprite if used) on R2

**Acceptance**
- [ ] To-Let upload from a phone camera → appears in admin → approve → visible on map with photo
- [ ] Rejected photo deleted from storage
- [ ] Non-admin logged-in user cannot call `admin-review`
- [ ] Locality pages exist only for localities with enough data; WhatsApp preview of `/beltola/` shows real numbers
- [ ] Backup workflow run produces an artifact; keep-alive run succeeds; build hook triggers deploy
- [ ] Launch checklist (§17) complete

### Later (only after ~300 real pins)
- Area stats (draw rectangle → `area_stats()`)
- Watch-this-area alerts (email when a listing appears within 1 km)
- To-Let spotter leaderboard
- Distance to hubs (GS Road, Dispur, Ganeshguri, Jalukbari, Six Mile, Paltan Bazar) in pin details
- Nearby schools/hospitals from a one-time OSM extract (static GeoJSON, never live Overpass)
- Per-pin share pages with OG previews

---

## 16. Dependencies (allowed list)

```bash
npm create vite@latest guwahati-rent -- --template vanilla-ts
npm i maplibre-gl pmtiles @protomaps/basemaps @supabase/supabase-js zod browser-image-compression
npm i -D tsx eslint prettier typescript
```
Edge Functions: Deno imports of `@supabase/supabase-js` and `zod` via `npm:` specifiers. Resend via plain `fetch` to its REST API (no SDK needed).

---

## 17. Launch checklist

- [ ] Security gate (Phase 0) re-run against production — all pass
- [ ] Service role key not present anywhere in `dist/` (`grep -r "service_role" dist/` and grep for the key prefix)
- [ ] `.env` never committed (`git log --all -- .env` is empty)
- [ ] Turnstile, bbox, plausibility, rate limits all verified
- [ ] Lighthouse mobile: Performance ≥ 80, Accessibility ≥ 95
- [ ] Tested on a budget Android over 4G
- [ ] Backups, keep-alive, nightly rebuild running
- [ ] Privacy/terms reviewed
- [ ] Locality coordinates verified
- [ ] **150+ real pins across 15+ localities** before any public post
- [ ] Launch posts ready: Reddit r/guwahati, college/hostel WhatsApp groups, local Facebook groups, local media pitch; hook = monsoon waterlogging map

---

## Appendix A — Manual setup guide [HUMAN]

| # | Task | Notes |
|---|---|---|
| 1 | Supabase project | Region Mumbai (ap-south-1). Save URL, anon key, service role key (password manager). |
| 2 | Extensions | Dashboard → Database → Extensions: PostGIS, pg_cron, pg_net. |
| 3 | Cloudflare account | Separate from anything else is fine. |
| 4 | Turnstile | Add site; domains: `localhost` + your domain. Save site key + secret. |
| 5 | R2 bucket `tiles` | Enable public access (r2.dev URL) or custom domain `tiles.<domain>`. |
| 6 | PMTiles extract | Install `pmtiles` CLI from github.com/protomaps/go-pmtiles/releases, then: `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles guwahati.pmtiles --bbox=91.55,26.05,91.95,26.25 --maxzoom=16` (pick a recent date from build.protomaps.com). Upload to `tiles`. |
| 7 | R2 CORS | See JSON below. Without `range`, the map is blank. |
| 8 | Domain | `.in` (cheap renewals) recommended over `.rent` (expensive renewals). DNS on Cloudflare. |
| 9 | Resend | Add domain, add DNS records (SPF/DKIM), wait for verified. |
| 10 | Netlify | New account (separate from portfolio). Connect repo later. Create build hook. |
| 11 | GitHub secrets | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `NETLIFY_BUILD_HOOK_URL`. |
| 12 | Vault secrets | SQL editor: `vault.create_secret(...)` per §6.3. |
| 13 | Admin user | Supabase Auth → add your email → `insert into admins (user_id) values ('<uuid>');` |

R2 CORS policy:
```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://<your-domain>"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["range", "if-match"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## Appendix B — Red flags when reviewing agent output

| Red flag | Action |
|---|---|
| "Disabled RLS" / `using (true)` / `grant insert ... to anon` | Reject and revert |
| Service role key in `src/`, `VITE_*`, or any committed file | Reject; rotate key in Supabase immediately |
| `new maplibregl.Marker()` in a loop | Reject; use GeoJSON source + layers |
| React/Vue/Next/Tailwind plugins or many new deps installed | Ask for justification or remove |
| "All phases complete" in one session | Assume untested; verify yourself |
| "Tested" with no command output | Ask for the output |
| Contacts table referenced in any view or public query | Reject |
| Unsubscribe performed on GET | Reject |
| Emails sent per match instead of per-recipient digest | Reject |
