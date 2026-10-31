#!/usr/bin/env bash
# Security gate — SPEC.md v2 §15 Phase 0. Runs every check with the ANON key only.
#
# Usage:
#   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon-key> bash scripts/security-check.sh
# or, with no env vars set, it reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.
#
# Before running: [HUMAN] insert the test rows from SPEC §15 (Phase 0, step 1).
# After running:  [HUMAN] delete them.
# Exit code 0 = every check passed. Any FAIL = STOP and fix before building UI.

set -uo pipefail

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_ANON_KEY:-}" ]] && [[ -f .env ]]; then
  SUPABASE_URL="${SUPABASE_URL:-$(grep -E '^VITE_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"'\''')}"
  SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"'\''')}"
fi
URL="${SUPABASE_URL:-}"
ANON="${SUPABASE_ANON_KEY:-}"
if [[ -z "$URL" || -z "$ANON" ]]; then
  echo "Set SUPABASE_URL and SUPABASE_ANON_KEY (or fill .env)." >&2
  exit 2
fi
URL="${URL%/}"

# Refuse to run with a privileged key: every check would "fail" and the key would be in shell history.
if [[ "$ANON" == sb_secret_* ]]; then
  echo "ABORT: that is a secret key, not the anon/publishable key." >&2
  exit 2
fi
if [[ "$ANON" == *.*.* ]] && command -v python3 >/dev/null; then
  role=$(python3 -c 'import sys,json,base64
p=sys.argv[1].split(".")[1]; p+="="*(-len(p)%4)
print(json.loads(base64.urlsafe_b64decode(p)).get("role",""))' "$ANON" 2>/dev/null || true)
  if [[ "$role" != "anon" ]]; then
    echo "ABORT: JWT role is '$role', expected 'anon'. Never run this with the service role key." >&2
    exit 2
  fi
fi

# New `sb_publishable_` keys go in `apikey` only; legacy anon JWTs also work as a Bearer token.
H=(-H "apikey: $ANON")
if [[ "$ANON" == *.*.* ]]; then H+=(-H "Authorization: Bearer $ANON"); fi
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
failures=0

# req <method> <path> [body] [content-type] -> sets STATUS and BODY
req() {
  local method=$1 path=$2 data=${3:-} ctype=${4:-application/json}
  if [[ -n "$data" ]]; then
    STATUS=$(curl -s -o "$TMP" -w '%{http_code}' -X "$method" "$URL$path" "${H[@]}" \
      -H "Content-Type: $ctype" --data-binary "$data")
  else
    STATUS=$(curl -s -o "$TMP" -w '%{http_code}' -X "$method" "$URL$path" "${H[@]}")
  fi
  BODY=$(cat "$TMP")
  # A network failure must never count as "denied".
  if [[ "$STATUS" == "000" ]]; then
    echo "ABORT: could not reach $URL$path (curl status 000). No result is trustworthy." >&2
    exit 2
  fi
  # A server error is not "access denied" either: the database may be down or paused.
  if [[ "$STATUS" =~ ^5 ]]; then
    echo "ABORT: $URL$path returned HTTP $STATUS (${BODY:0:200}). Server error, so no result is trustworthy." >&2
    echo "       Is the Supabase project paused or still starting? Retry in a minute." >&2
    exit 2
  fi
}
is2xx() { [[ "$STATUS" =~ ^2 ]]; }
pass() { printf 'PASS  %-4s %s\n' "$1" "$2"; }
fail() { printf 'FAIL  %-4s %s\n      status=%s body=%s\n' "$1" "$2" "$STATUS" "${BODY:0:300}"; failures=$((failures + 1)); }

# Pass when the request errors, or succeeds with an empty array.
expect_denied_or_empty() {
  local n=$1 desc=$2 method=$3 path=$4 data=${5:-} ctype=${6:-application/json}
  req "$method" "$path" "$data" "$ctype"
  if is2xx && [[ "$BODY" != "[]" ]]; then fail "$n" "$desc"; else pass "$n" "$desc (status $STATUS)"; fi
}
# Pass only when the request errors.
expect_error() {
  local n=$1 desc=$2 method=$3 path=$4 data=${5:-} ctype=${6:-application/json}
  req "$method" "$path" "$data" "$ctype"
  if is2xx; then fail "$n" "$desc"; else pass "$n" "$desc (status $STATUS)"; fi
}

echo "Security gate against $URL"
echo

# --- The seven checks from SPEC §15 Phase 0 ---
# Any non-empty 2xx body fails here, which covers leak-test@example.com being visible.
expect_denied_or_empty 1 "anon cannot read pin_contacts" GET "/rest/v1/pin_contacts?select=*"

expect_denied_or_empty 2 "anon cannot read pins table" GET "/rest/v1/pins?select=*"

req GET "/rest/v1/public_pins?select=*"
rows=$(grep -o '"id":' <<<"$BODY" | wc -l | tr -d ' ')
if ! is2xx || [[ "$BODY" == "[]" ]]; then
  fail 3 "public_pins returns the test row"
elif grep -qE '"(email|phone|edit_token_hash|report_count|status)"|leak-test' <<<"$BODY"; then
  fail 3 "public_pins exposes a private column"
elif [[ "$rows" != "1" ]]; then
  pass 3 "public_pins readable, no private columns ($rows rows; expected 1 with only the test data)"
else
  pass 3 "public_pins returns 1 row, no email/phone/edit_token_hash"
fi

expect_error 4 "anon cannot INSERT into pins" POST "/rest/v1/pins" '{"kind":"rent","rent":5000}'
expect_error 5 "anon cannot run run_matching()" POST "/rest/v1/rpc/run_matching"
expect_error 6 "anon cannot run cleanup()" POST "/rest/v1/rpc/cleanup"

req POST "/rest/v1/rpc/area_stats" '{"min_lng":91.5,"min_lat":26.0,"max_lng":92.0,"max_lat":26.3}'
if is2xx; then pass 7 "anon can run area_stats() -> $BODY (expect [] with < 3 pins)"; else fail 7 "anon can run area_stats()"; fi

# --- Extra checks for the rest of SPEC §5 (tables/functions added in v2) ---
echo
for t in seeker_contacts interests seekers matches reports tolet_boards tolet_reports rate_limits admins; do
  expect_denied_or_empty "x" "anon cannot read $t" GET "/rest/v1/$t?select=*"
done
expect_error "x" "anon cannot run hit_rate_limit()" POST "/rest/v1/rpc/hit_rate_limit" \
  '{"p_key":"k","p_action":"a","p_limit":1,"p_window":"1 day"}'
expect_error "x" "anon cannot run flag_outliers()" POST "/rest/v1/rpc/flag_outliers"
expect_error "x" "anon cannot UPDATE pins" PATCH "/rest/v1/pins?id=not.is.null" '{"rent":1000}'
expect_error "x" "anon cannot DELETE pin_contacts" DELETE "/rest/v1/pin_contacts?pin_id=not.is.null"
expect_error "x" "anon cannot upload to private tolet bucket" POST "/storage/v1/object/tolet/pending/security-check.jpg" '{}'

# --- Phase 2a: To-Let boards (NEXT-PHASES §2a.10). Needs migration 0004. ---
echo
expect_error "2a" "anon cannot INSERT into tolet_boards" POST "/rest/v1/tolet_boards" \
  '{"photo_path":"x","location":"SRID=4326;POINT(91.79 26.14)","status":"approved"}'
expect_error "2a" "anon cannot INSERT into tolet_reports" POST "/rest/v1/tolet_reports" \
  '{"board_id":"00000000-0000-0000-0000-000000000000","reporter_hash":"x"}'
expect_denied_or_empty "2a" "anon cannot list the private tolet bucket" POST "/storage/v1/object/list/tolet" \
  '{"prefix":"","limit":100,"offset":0}'
expect_denied_or_empty "2a" "anon cannot list pending uploads" POST "/storage/v1/object/list/tolet" \
  '{"prefix":"pending/","limit":100,"offset":0}'
expect_error "2a" "anon cannot download from the private tolet bucket" GET "/storage/v1/object/tolet/pending/security-check/full.webp"
expect_error "2a" "anon cannot download via the authenticated route" GET "/storage/v1/object/authenticated/tolet/pending/security-check/full.webp"
expect_error "2a" "anon cannot read private files via the public route" GET "/storage/v1/object/public/tolet/pending/security-check/full.webp"
# Sent as image/webp (an allowed type), so a refusal means "not allowed", not "wrong file type".
WEBP='RIFF0000WEBPsecurity-check'
expect_error "2a" "anon cannot upload to tolet-public" POST "/storage/v1/object/tolet-public/security-check/full.webp" "$WEBP" image/webp
expect_error "2a" "anon cannot overwrite in tolet-public" PUT "/storage/v1/object/tolet-public/security-check/full.webp" "$WEBP" image/webp
expect_error "2a" "anon cannot upload to private tolet bucket (webp)" POST "/storage/v1/object/tolet/pending/security-check/full.webp" "$WEBP" image/webp
# Storage answers a delete that RLS blocks with 200 [] (nothing removed); a real delete lists the objects.
expect_denied_or_empty "2a" "anon cannot delete from tolet-public" DELETE "/storage/v1/object/tolet-public" '{"prefixes":["security-check/full.webp"]}'

req GET "/rest/v1/public_tolet?select=*"
if ! is2xx; then
  fail "2a" "public_tolet is readable"
elif grep -qE '"(photo_path|thumb_path|uploader_hash|status|phone_text|note|spotter_name)"' <<<"$BODY"; then
  fail "2a" "public_tolet exposes a private column"
else
  pass "2a" "public_tolet readable, no private columns (status $STATUS)"
fi
# An empty view proves nothing about its columns, so also ask for each private column by name.
for col in photo_path thumb_path uploader_hash status gone_reports; do
  expect_error "2a" "public_tolet has no $col column" GET "/rest/v1/public_tolet?select=$col"
done

req GET "/rest/v1/public_pins?select=*&limit=5"
if ! is2xx; then
  fail "2a" "public_pins still readable"
elif grep -q '"import_ref"' <<<"$BODY"; then
  fail "2a" "public_pins exposes import_ref"
else
  pass "2a" "public_pins still readable, no import_ref (status $STATUS)"
fi
expect_error "2a" "public_pins has no import_ref column" GET "/rest/v1/public_pins?select=import_ref"
expect_error "2a" "anon cannot run bump_tolet_gone()" POST "/rest/v1/rpc/bump_tolet_gone"

echo
if [[ $failures -eq 0 ]]; then
  echo "ALL CHECKS PASSED. [HUMAN] now delete the test rows."
  exit 0
fi
echo "$failures CHECK(S) FAILED. STOP: do not loosen RLS/grants; report back."
exit 1
