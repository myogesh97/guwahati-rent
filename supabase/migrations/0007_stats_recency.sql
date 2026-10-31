-- 0007: stats use the last 18 months of rents (NEXT-PHASES.md §1b, §4.4).
-- Rent pins are never deleted; old ones stay on the map behind "Posted within → All",
-- but medians describe today's market. Same columns, same min-3 rule, same grants
-- (create or replace keeps them).

create or replace view public.public_stats_city with (security_barrier) as
select bhk, property_type, gated,
       count(*) as n,
       percentile_cont(0.5) within group (order by rent) as median_rent
from public.pins
where status = 'active' and not is_outlier and report_count < 3
  and created_at > now() - interval '18 months'
group by bhk, property_type, gated
having count(*) >= 3;

create or replace view public.public_stats_locality with (security_barrier) as
select locality_slug, bhk,
       count(*) as n,
       percentile_cont(0.5) within group (order by rent) as median_rent,
       round(100.0 * avg((waterlogging = 'enters_premises')::int), 0) as pct_waterlog_severe,
       max(created_at) as last_pin_at
from public.pins
where status = 'active' and not is_outlier and report_count < 3
  and locality_slug is not null
  and created_at > now() - interval '18 months'
group by locality_slug, bhk
having count(*) >= 3;

create or replace function public.area_stats(min_lng float8, min_lat float8, max_lng float8, max_lat float8)
returns table (bhk smallint, n bigint, median_rent float8)
language sql stable security definer set search_path = public, extensions as $$
  select p.bhk, count(*), percentile_cont(0.5) within group (order by p.rent)
  from public.pins p
  where p.status = 'active' and not p.is_outlier and p.report_count < 3
    and p.created_at > now() - interval '18 months'
    and p.location::geometry && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  group by p.bhk
  having count(*) >= 3;
$$;

-- Unchanged from 0001; repeated so this file is self-contained.
grant select on public.public_stats_city, public.public_stats_locality to anon, authenticated;
grant execute on function public.area_stats(float8, float8, float8, float8) to anon, authenticated;
