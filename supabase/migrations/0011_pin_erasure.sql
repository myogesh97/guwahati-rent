-- 0011: deleting a pin erases it (docs/wrap/PENDING.md PW-26).
--
-- Until now "Delete my pin" (edit-pin) and an admin's "Remove" (admin-review) only set
-- status = 'archived', and nothing ever removed archived rows: the note, society name, exact size
-- and location stayed in the database and in every backup. The privacy policy says deleting your
-- pin is how you withdraw consent, so:
--   - edit-pin now DELETEs the row (reports, contacts, matches, interests cascade;
--     moderation_log keeps its entry with pin_id set to null);
--   - pins an admin removes stay archived for 30 days, so a decision can be reviewed, then
--     cleanup() deletes them;
--   - archived_at records when a pin was archived. Pins already archived before this migration
--     get now(), so they are purged 30 days after it is applied.
-- Additive: one nullable column, one trigger, cleanup() replaced (create or replace keeps its
-- grants: service role / cron only). public_pins is unchanged.

alter table public.pins add column if not exists archived_at timestamptz;

update public.pins set archived_at = now() where status = 'archived' and archived_at is null;

create or replace function public.set_pin_archived_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.archived_at := now();
  elsif new.status <> 'archived' then
    new.archived_at := null;
  end if;
  return new;
end $$;

drop trigger if exists pins_archived_at on public.pins;
create trigger pins_archived_at before update of status on public.pins
  for each row execute function public.set_pin_archived_at();

revoke execute on function public.set_pin_archived_at() from anon, authenticated, public;

-- cleanup() from 0006, unchanged, plus: archived pins are deleted 30 days after archiving.
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

  -- Archived pins are erased 30 days after archiving (reports etc. cascade)
  delete from public.pins
  where status = 'archived' and archived_at < now() - interval '30 days';

  -- Report messages are private and short-lived: gone 90 days after the report is resolved
  update public.reports set message = null
  where message is not null and status <> 'open' and resolved_at < now() - interval '90 days';

  -- Old interests & rate-limit rows
  delete from public.interests where created_at < now() - interval '60 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';
end $$;

revoke execute on function public.cleanup() from anon, authenticated, public;
