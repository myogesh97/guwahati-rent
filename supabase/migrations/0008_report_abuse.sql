-- 0008: harden reports against one person posing as many (SECURITY_AUDIT_REPORT.md M-1).
--   * Reports are also unique per salted IP hash, not only per browser id (which the client
--     chooses freely). ip_hash is null for rows from before this migration.
--   * Boards reported gone 3+ times are only HIDDEN (public_tolet already filters gone_reports < 3)
--     and wait for an admin in admin-review (list_gone / keep_board / remove_board).
--     tolet-maintenance no longer deletes them on its own.
-- Requires 0006 (moderation_log, reports.status).

alter table public.reports       add column if not exists ip_hash text;
alter table public.tolet_reports add column if not exists ip_hash text;

create unique index if not exists reports_pin_ip_uniq
  on public.reports (pin_id, ip_hash) where ip_hash is not null;
create unique index if not exists tolet_reports_board_ip_uniq
  on public.tolet_reports (board_id, ip_hash) where ip_hash is not null;

-- Admin queue: approved boards that the public view hides because of gone reports.
create index if not exists tolet_gone_review_idx
  on public.tolet_boards (gone_reports) where status = 'approved' and gone_reports >= 3;

-- New columns/indexes inherit the tables' grants: nothing for anon/authenticated.
revoke all on public.reports, public.tolet_reports from anon, authenticated;
