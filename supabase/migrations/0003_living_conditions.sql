-- 0003: Guwahati living conditions on pins (water, waterlogging detail, power cuts, maintenance).
-- Additive and non-destructive: every new column is nullable, NULL = "not reported".
-- Old rows keep working; the existing `waterlogging` / `water_supply` columns are kept because the
-- heatmap and stats (SPEC §6.1, §8.3) read `waterlogging`. New pins get `waterlogging` derived
-- server-side from the detailed answers (see supabase/functions/_shared/rules.ts).
-- Allowed values here MUST match rules.ts.

alter table public.pins
  -- Water ------------------------------------------------------------------
  add column water_sources text[]
    check (water_sources is null or (
      cardinality(water_sources) between 1 and 6
      and water_sources <@ array['piped', 'borewell', 'well', 'tanker', 'shared_tank', 'other']::text[])),
  add column water_availability text
    check (water_availability in ('24h', 'daily_fixed', 'daily_limited', 'alternate_day', 'irregular', 'unknown')),
  -- Litres the household gets on each day water comes (alternate_day: per supply day, NOT per day).
  add column water_litres integer check (water_litres between 20 and 20000),
  add column water_hours text check (char_length(water_hours) <= 60),
  add column water_extra_cost text check (water_extra_cost in ('none', 'tanker', 'charge', 'both')),
  add column water_shared boolean,
  add column drinking_water text
    check (drinking_water in ('supplied', 'purifier', 'buy_cans', 'boil_filter', 'other')),
  add column water_note text check (char_length(water_note) <= 150),
  -- Waterlogging detail (property level; never a claim about the whole locality) ---
  add column waterlog_where text[]
    check (waterlog_where is null or (
      cardinality(waterlog_where) between 1 and 6
      and waterlog_where <@ array['access_road', 'neighbourhood', 'entrance', 'parking', 'ground_floor', 'inside_home']::text[])),
  add column waterlog_severity text check (waterlog_severity in ('minor', 'moderate', 'severe')),
  add column waterlog_duration text check (waterlog_duration in ('under_3h', '3_to_12h', '12_to_48h', 'over_48h')),
  add column road_in_rain text check (road_in_rain in ('usable', 'difficult', 'cut_off')),
  add column floor_level text check (floor_level in ('ground', 'upper', 'whole_house')),
  add column waterlog_note text check (char_length(waterlog_note) <= 150),
  -- Other ------------------------------------------------------------------
  add column power_cuts text check (power_cuts in ('rare', 'weekly', 'daily', 'several_daily')),
  add column maintenance_amount integer check (maintenance_amount between 0 and 50000),
  -- When the renter last saw these conditions (optional; defaults to created_at when shown).
  add column conditions_as_of date check (conditions_as_of >= date '2000-01-01');

-- Integrity: detail only makes sense with the answer it hangs off.
-- NULL-safe on purpose: a CHECK that evaluates to NULL passes, so plain `x in (...)` / `x = false`
-- would let rows through when the parent answer is missing.
alter table public.pins
  add constraint pins_water_qty_needs_schedule check (
    (water_litres is null and water_hours is null)
    or coalesce(water_availability in ('daily_fixed', 'daily_limited', 'alternate_day', 'irregular'), false)),
  add constraint pins_waterlog_detail_needs_where check (
    (waterlog_severity is null and waterlog_duration is null) or waterlog_where is not null),
  add constraint pins_maint_amount_needs_separate check (
    maintenance_amount is null or maintenance_incl is false);

-- Expose the new columns publicly. `create or replace view` may only APPEND columns, so the
-- existing column list is repeated unchanged and the new ones follow. Grants are preserved.
-- None of these columns is contact data (SPEC §5.1).
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
  power_cuts, maintenance_amount, conditions_as_of
from public.pins
where status = 'active'
  and report_count < 3
  and (listing_expires_at is null or listing_expires_at > now());
