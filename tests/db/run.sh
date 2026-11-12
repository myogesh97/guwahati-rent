#!/usr/bin/env bash
# Database integration test (PRODUCTION_READINESS_REPORT.md P1-5): applies every migration to a THROWAWAY local
# Postgres + PostGIS cluster that mimics Supabase (roles, Supabase's permissive default grants,
# auth/storage/cron/vault/net stubs), then checks the security rules of SPEC §5 and the stats rules.
# Never touches the real project. Needs `initdb`, `pg_ctl`, `psql` and the PostGIS extension.
#   npm run test:db
set -uo pipefail
cd "$(dirname "$0")/../.."

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null || { echo "NOT RUN: $bin not found (install PostgreSQL + PostGIS)"; exit 2; }
done

DIR=$(mktemp -d "${TMPDIR:-/tmp}/gr-dbtest.XXXXXX")
PORT=${DBTEST_PORT:-54329}
cleanup() { pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1; rm -rf "$DIR"; }
trap cleanup EXIT

initdb -D "$DIR/data" -U postgres --auth=trust >/dev/null || { echo "ABORT: initdb failed"; exit 2; }
pg_ctl -D "$DIR/data" -l "$DIR/log" -o "-p $PORT -k $DIR -c listen_addresses=''" -w start >/dev/null ||
  { echo "ABORT: postgres did not start"; cat "$DIR/log"; exit 2; }

PSQL=(psql -X -q -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -At -c "$1" 2>&1; }

# ---- Supabase look-alike: roles, default grants (the dangerous part), stub schemas -------------
"${PSQL[@]}" <<'SQL' || { echo "ABORT: shim failed"; exit 2; }
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
alter database postgres set search_path = "$user", public, extensions;
-- Supabase grants anon/authenticated everything on new public objects by default. Migration 0001
-- must revoke that; keeping it here makes the "later table" check below a real negative control.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean,
                              file_size_limit bigint, allowed_mime_types text[]);
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as
  $$ insert into cron.job (jobname, schedule, command) values (n, s, c)
     on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
     returning jobid $$;
create function cron.unschedule(id bigint) returns boolean language sql as
  $$ with d as (delete from cron.job where jobid = id returning 1) select exists (select 1 from d) $$;
create schema vault;
create view vault.decrypted_secrets as select ''::text as name, ''::text as decrypted_secret where false;
create schema net;
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ select 1::bigint $$;
SQL

# ---- migrations ---------------------------------------------------------------------------------
for f in supabase/migrations/*.sql; do
  out=$("${PSQL[@]}" -f "$f" 2>&1) || { echo "FAIL  migration $(basename "$f")"; echo "$out" | tail -5; exit 1; }
done
echo "PASS  all $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations apply on a fresh database"

passes=0; fails=0
pass() { printf 'PASS  %s\n' "$1"; passes=$((passes + 1)); }
fail() { printf 'FAIL  %s\n      got: %s\n' "$1" "$2"; fails=$((fails + 1)); }
# expect_denied <role> <label> <sql>: must fail with a permission error
expect_denied() {
  local out; out=$(q "set role $1; $3")
  if grep -qiE "permission denied|must be owner" <<<"$out"; then pass "$2"; else fail "$2" "$out"; fi
}
# expect_eq <label> <sql> <expected>
expect_eq() {
  local out; out=$(q "$2")
  if [[ "$out" == "$3" ]]; then pass "$1"; else fail "$1 (expected '$3')" "$out"; fi
}

# ---- SPEC §5.1-5.4: anon/authenticated see only the public views + area_stats ------------------
PRIVATE=(pins pin_contacts seekers seeker_contacts matches interests reports tolet_boards tolet_reports rate_limits admins moderation_log)
for role in anon authenticated; do
  for t in "${PRIVATE[@]}"; do expect_denied $role "$role cannot read $t" "select 1 from public.$t limit 1"; done
  expect_denied $role "$role cannot INSERT into pins" \
    "insert into public.pins (kind, rent, furnishing, location, edit_token_hash) values ('rent', 5000, 'semi', 'SRID=4326;POINT(91.79 26.12)', 'x')"
  expect_denied $role "$role cannot UPDATE pins" "update public.pins set rent = 1"
  expect_denied $role "$role cannot DELETE pin_contacts" "delete from public.pin_contacts"
  expect_denied $role "$role cannot INSERT into reports" \
    "insert into public.reports (pin_id, reporter_hash) values (gen_random_uuid(), 'x')"
  for fn in "run_matching()" "cleanup()" "flag_outliers()" "hit_rate_limit('k', 'a', 1, '1 day')"; do
    expect_denied $role "$role cannot execute $fn" "select public.$fn"
  done
  for v in public_pins public_tolet public_seeker_dots public_stats_city public_stats_locality; do
    expect_eq "$role can read $v" "set role $role; select count(*) >= 0 from public.$v" "t"
  done
  expect_eq "$role can execute area_stats()" "set role $role; select count(*) >= 0 from public.area_stats(91.5, 26.0, 92.0, 26.3)" "t"
done

expect_eq "RLS is enabled on every public table" \
  "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity" "0"
expect_eq "no RLS policies exist (service role only; never using (true))" \
  "select count(*) from pg_policies where schemaname = 'public'" "0"
expect_eq "public_pins exposes no private column" \
  "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'public_pins' and column_name in ('edit_token_hash','status','report_count','import_ref','location','email','phone','reviewed_at')" "0"
expect_eq "public_tolet exposes no private column" \
  "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'public_tolet' and column_name in ('photo_path','thumb_path','uploader_hash','status','location','gone_reports')" "0"
q "create table public.later_table (secret text); alter table public.later_table enable row level security;" >/dev/null
expect_denied anon "a table created AFTER the migrations is still private (default privileges revoked)" "select * from public.later_table"
expect_eq "no grants of any kind to anon on base tables" \
  "select count(*) from information_schema.role_table_grants g join pg_class c on c.relname = g.table_name join pg_namespace n on n.oid = c.relnamespace and n.nspname = g.table_schema where g.grantee in ('anon','authenticated') and g.table_schema = 'public' and c.relkind = 'r'" "0"

# ---- seed data (as the service role would) -------------------------------------------------------
"${PSQL[@]}" <<'SQL' >/dev/null || { echo "ABORT: seed failed"; exit 1; }
-- Beltola 2 BHK: three recent rents, median 12000 (average would be 17333); one 19 months old.
insert into public.pins (kind, bhk, rent, furnishing, waterlogging, locality_slug, location, edit_token_hash, created_at) values
  ('rent', 2, 10000, 'semi', 'enters_premises', 'beltola', 'SRID=4326;POINT(91.797 26.121)', 'h', now()),
  ('rent', 2, 12000, 'semi', 'none',            'beltola', 'SRID=4326;POINT(91.798 26.122)', 'h', now()),
  ('rent', 2, 30000, 'semi', 'unknown',         'beltola', 'SRID=4326;POINT(91.799 26.121)', 'h', now()),
  ('rent', 2, 99000, 'semi', 'none',            'beltola', 'SRID=4326;POINT(91.797 26.123)', 'h', now() - interval '19 months');
-- Survey 1 BHK: only two rents (below the n >= 3 rule).
insert into public.pins (kind, bhk, rent, furnishing, locality_slug, location, edit_token_hash) values
  ('rent', 1, 8000, 'semi', 'survey', 'SRID=4326;POINT(91.792 26.128)', 'h'),
  ('rent', 1, 9000, 'semi', 'survey', 'SRID=4326;POINT(91.793 26.128)', 'h');
-- Dispur 3 BHK: five rents, one wildly high (outlier candidate).
insert into public.pins (kind, bhk, rent, furnishing, locality_slug, location, edit_token_hash)
select 'rent', 3, r, 'furnished', 'dispur', 'SRID=4326;POINT(91.790 26.143)', 'h'
from unnest(array[20000, 21000, 22000, 23000, 140000]) r;
SQL

expect_eq "locality median is a median, not an average (beltola 2 BHK = 12000)" \
  "select median_rent from public.public_stats_locality where locality_slug = 'beltola' and bhk = 2" "12000"
expect_eq "18-month window: the 19-month-old rent is excluded from stats (n = 3)" \
  "select n from public.public_stats_locality where locality_slug = 'beltola' and bhk = 2" "3"
expect_eq "18-month window: the old rent stays on the map (public_pins)" \
  "select count(*) from public.public_pins where locality_slug = 'beltola'" "4"
expect_eq "groups under 3 rents are never shown (survey 1 BHK)" \
  "select count(*) from public.public_stats_locality where locality_slug = 'survey'" "0"
expect_eq "area_stats() also hides groups under 3 rents" \
  "set role anon; select count(*) from public.area_stats(91.791, 26.127, 91.794, 26.129)" "0"
expect_eq "area_stats() median for a box around beltola" \
  "set role anon; select median_rent from public.area_stats(91.79, 26.11, 91.80, 26.13) where bhk = 2" "12000"
expect_eq "0009: waterlogging share counts only rents that answered (1 of 2 = 50)" \
  "select pct_waterlog_severe from public.public_stats_locality where locality_slug = 'beltola' and bhk = 2" "50"
expect_eq "city stats use a median and n >= 3" \
  "select n || ':' || median_rent from public.public_stats_city where bhk = 2 and property_type = 'flat' and not gated" "3:12000"

q "select public.flag_outliers()" >/dev/null
expect_eq "flag_outliers flags a rent > 3x the median when the group has 5+" \
  "select count(*) from public.pins where locality_slug = 'dispur' and is_outlier" "1"
expect_eq "outliers are left out of the stats" \
  "select n from public.public_stats_locality where locality_slug = 'dispur'" "4"
q "update public.pins set status = 'archived' where locality_slug = 'dispur' and rent = 20000; select public.flag_outliers()" >/dev/null
expect_eq "0009: flag_outliers clears the flag once the group drops below 5" \
  "select count(*) from public.pins where locality_slug = 'dispur' and is_outlier" "0"

# ---- reports: auto-hide at 3, one per browser and per IP -------------------------------------------
PIN=$(q "select id from public.pins where locality_slug = 'beltola' and rent = 30000")
q "insert into public.reports (pin_id, reporter_hash, ip_hash, reason) values ('$PIN', 'b1', 'i1', 'fake_rent'), ('$PIN', 'b2', 'i2', 'fake_rent')" >/dev/null
expect_eq "two reports do not hide a pin" "select status from public.pins where id = '$PIN'" "active"
out=$(q "insert into public.reports (pin_id, reporter_hash, ip_hash, reason) values ('$PIN', 'b1', 'i9', 'spam')")
if grep -q "duplicate key" <<<"$out"; then pass "same browser cannot report the same pin twice"; else fail "same browser cannot report the same pin twice" "$out"; fi
out=$(q "insert into public.reports (pin_id, reporter_hash, ip_hash, reason) values ('$PIN', 'b7', 'i1', 'spam')")
if grep -q "duplicate key" <<<"$out"; then pass "0008: same IP with a new browser id cannot report the same pin twice"; else fail "0008: same IP with a new browser id cannot report the same pin twice" "$out"; fi
q "insert into public.reports (pin_id, reporter_hash, ip_hash, reason) values ('$PIN', 'b3', 'i3', 'broker')" >/dev/null
expect_eq "3 reports from 3 browsers/IPs auto-hide the pin" "select status || ':' || report_count from public.pins where id = '$PIN'" "hidden:3"
expect_eq "a hidden pin disappears from public_pins" "select count(*) from public.public_pins where id = '$PIN'" "0"
q "insert into public.reports (pin_id, reporter_hash, reason, message) values ((select id from public.pins where rent = 12000), 'b4', 'other', 'leak-report-message')" >/dev/null
leak=$(q "set role anon; select (select string_agg(t::text, '') from public.public_pins t) || (select coalesce(string_agg(t::text, ''), '') from public.public_stats_locality t)")
if grep -q "leak-report-message" <<<"$leak"; then fail "report messages never appear in public views" "leaked"; else pass "report messages never appear in public views"; fi

# ---- To-Let boards: only approved, unexpired, not reported gone ----------------------------------
"${PSQL[@]}" <<'SQL' >/dev/null || { echo "ABORT: board seed failed"; exit 1; }
insert into public.tolet_boards (photo_path, status, location, expires_at, gone_reports) values
  ('a', 'approved', 'SRID=4326;POINT(91.79 26.12)', now() + interval '10 days', 0),
  ('b', 'pending',  'SRID=4326;POINT(91.79 26.12)', now() + interval '10 days', 0),
  ('c', 'approved', 'SRID=4326;POINT(91.79 26.12)', now() - interval '1 day', 0),
  ('d', 'approved', 'SRID=4326;POINT(91.79 26.12)', now() + interval '10 days', 3);
SQL
expect_eq "public_tolet shows only approved, unexpired boards with < 3 gone reports" \
  "set role anon; select count(*) from public.public_tolet" "1"

# ---- rate limits, cleanup, cron ------------------------------------------------------------------
expect_eq "hit_rate_limit allows up to the limit, then refuses" \
  "select string_agg(public.hit_rate_limit('k', 'test', 2, '1 day')::text, ',') from generate_series(1, 3)" "true,true,false"
q "insert into public.rate_limits (key, action, window_start, count) values ('old', 'test', now() - interval '3 days', 1); select public.cleanup()" >/dev/null
expect_eq "cleanup() prunes rate-limit rows older than 2 days" \
  "select count(*) from public.rate_limits where key = 'old'" "0"
expect_eq "0009: Phase 3 cron jobs are unscheduled; live jobs remain" \
  "select string_agg(jobname, ',' order by jobname) from cron.job" "cleanup,flag-outliers,tolet-maintenance"
expect_eq "storage buckets: tolet private, tolet-public public, 512 KB, webp/jpeg only" \
  "select string_agg(id || ':' || public || ':' || file_size_limit || ':' || array_to_string(allowed_mime_types, '+'), ' ' order by id) from storage.buckets" \
  "tolet:false:524288:image/webp+image/jpeg tolet-public:true:524288:image/webp+image/jpeg"

echo
echo "$passes passed, $fails failed"
[[ $fails -eq 0 ]]
