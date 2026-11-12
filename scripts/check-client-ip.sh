#!/usr/bin/env bash
# SECURITY_AUDIT_REPORT.md M-2: can a client forge the IP that rate limits use?
# Needs the temporary `ip-check` function deployed and CRON_SECRET in your shell:
#   npx supabase functions deploy ip-check
#   CRON_SECRET=... bash scripts/check-client-ip.sh
#   npx supabase functions delete ip-check
set -uo pipefail
URL="${SUPABASE_URL:-$(grep -E '^VITE_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"'\''')}"
KEY="${SUPABASE_ANON_KEY:-$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"'\''')}"
[[ -z "${CRON_SECRET:-}" || -z "$URL" ]] && { echo "Set CRON_SECRET (and fill .env)." >&2; exit 2; }
FAKE=203.0.113.77   # TEST-NET-3: never a real client

call() {
  curl -s -X POST "${URL%/}/functions/v1/ip-check" -H "apikey: $KEY" -H "x-cron-secret: $CRON_SECRET" \
    -H 'Content-Type: application/json' "$@" --data '{}'
}
echo "Plain request:";  call; echo
echo "Forged headers:"; out=$(call -H "X-Forwarded-For: $FAKE" -H "X-Real-IP: $FAKE" -H "CF-Connecting-IP: $FAKE"); echo "$out"
echo
if grep -q "\"chosen\":\"$FAKE\"" <<<"$out"; then
  echo "FAIL: the IP used for rate limits can be forged. Pick a header above that did NOT echo $FAKE"
  echo "      but did show your real IP, then: npx supabase secrets set CLIENT_IP_HEADER=<that header>"
  exit 1
fi
echo "PASS: the forged value was not used. Delete the function: npx supabase functions delete ip-check"
