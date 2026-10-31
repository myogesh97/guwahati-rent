-- 0006: report / flag a pin, with admin moderation (NEXT-PHASES.md §4.1).
-- From the §4.1 draft, with one addition: report messages are deleted 90 days after the report
-- is resolved (§4.1 "extend cleanup()"; the draft didn't). Everything else is as drafted.

alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports
  add constraint reports_reason_check
  check (reason in ('fake_rent','broker','wrong_location','rented_out','offensive','spam','other')),
  add column if not exists message     text check (char_length(message) <= 300),
  add column if not exists status      text not null default 'open'
                                       check (status in ('open','dismissed','actioned')),
  add column if not exists resolved_at timestamptz;
create index if not exists reports_open_idx on public.reports (pin_id) where status = 'open';

alter table public.pins add column if not exists reviewed_at timestamptz;

create table if not exists public.moderation_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references auth.users(id),
  pin_id     uuid references public.pins(id) on delete set null,
  board_id   uuid references public.tolet_boards(id) on delete set null,
  action     text not null check (action in ('keep','remove','approve','reject','restore')),
  created_at timestamptz not null default now()
);
alter table public.moderation_log enable row level security;  -- no policies

-- Replace the counter trigger: count OPEN reports, auto-hide at 3 (hidden, not deleted).
-- The reports_bump trigger from 0001 already points at this function.
create or replace function public.bump_report_count() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare open_count int;
begin
  -- Lock the pin row first so simultaneous reports are counted one after another
  -- (otherwise two concurrent inserts can each see only their own report).
  perform 1 from public.pins where id = new.pin_id for update;
  select count(*) into open_count from public.reports where pin_id = new.pin_id and status = 'open';
  update public.pins
     set report_count = open_count,
         status = case when open_count >= 3 and status = 'active' then 'hidden'::public.row_status else status end
   where id = new.pin_id;
  return new;
end $$;

-- cleanup() from 0001, unchanged, plus: resolved report messages are deleted after 90 days.
-- (create or replace keeps the existing grants: service role / cron only.)
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

  -- Report messages are private and short-lived: gone 90 days after the report is resolved
  update public.reports set message = null
  where message is not null and status <> 'open' and resolved_at < now() - interval '90 days';

  -- Old interests & rate-limit rows
  delete from public.interests where created_at < now() - interval '60 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';
end $$;

revoke all on public.moderation_log from anon, authenticated;
revoke execute on function public.bump_report_count() from anon, authenticated, public;
revoke execute on function public.cleanup() from anon, authenticated, public;
grant all on public.moderation_log to service_role;
