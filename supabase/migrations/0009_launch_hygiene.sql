-- 0009: launch hygiene (PRODUCTION_READINESS_REPORT.md P1-4, P2-4, P3-6). No table or column changes.
--   1. Phase 3 cron jobs are unscheduled until Phase 3 ships: `send-digests` calls a function
--      that does not exist (a daily 404) and `run-matching` has no seekers to match. Re-add both
--      with the Phase 3 migration.
--   2. public_stats_locality.pct_waterlog_severe counts only rents whose renter answered the
--      monsoon question (it used to divide by every rent, so "not sure" pulled it down).
--      Same columns, same types, same min-3 rule, same 18-month window; null when nobody answered.
--   3. flag_outliers() also clears the flag when a group drops below 5 rents (it used to leave
--      stale flags behind) and skips rows whose flag would not change.

-- 1. -------------------------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('send-digests', 'run-matching');

-- 2. -------------------------------------------------------------------------------------------
create or replace view public.public_stats_locality with (security_barrier) as
select locality_slug, bhk,
       count(*) as n,
       percentile_cont(0.5) within group (order by rent) as median_rent,
       round(100.0 * avg((waterlogging = 'enters_premises')::int)
                     filter (where waterlogging <> 'unknown'), 0) as pct_waterlog_severe,
       max(created_at) as last_pin_at
from public.pins
where status = 'active' and not is_outlier and report_count < 3
  and locality_slug is not null
  and created_at > now() - interval '18 months'
group by locality_slug, bhk
having count(*) >= 3;

-- 3. -------------------------------------------------------------------------------------------
create or replace function public.flag_outliers() returns void
language sql security definer set search_path = public, extensions as $$
  with med as (
    select locality_slug, bhk,
           percentile_cont(0.5) within group (order by rent) as m, count(*) as n
    from public.pins where status = 'active'
    group by locality_slug, bhk
  ), verdict as (
    select p.id,
           case when med.n >= 5 then (p.rent > 3 * med.m or p.rent < med.m / 3) else false end as flag
    from public.pins p
    join med on p.locality_slug is not distinct from med.locality_slug
            and p.bhk is not distinct from med.bhk
  )
  update public.pins p
  set is_outlier = v.flag
  from verdict v
  where p.id = v.id and p.is_outlier is distinct from v.flag;
$$;

-- Privileges: `create or replace` keeps them; restated so this file is self-contained.
grant select on public.public_stats_locality to anon, authenticated;
revoke execute on function public.flag_outliers() from anon, authenticated, public;
grant execute on function public.flag_outliers() to service_role;
