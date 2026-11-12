#!/usr/bin/env bash
# SECURITY_AUDIT_REPORT.md M-2 / PRODUCTION_READINESS_REPORT.md P0-3: is the IP used for rate limits real,
# known, and impossible to forge? Needs CRON_SECRET in your shell and a TEMPORARY function:
#
#   cp -r scripts/diagnostics/ip-check supabase/functions/ip-check
#   npx supabase functions deploy ip-check --no-verify-jwt
#   CRON_SECRET=... bash scripts/check-client-ip.sh
#   npx supabase functions delete ip-check && rm -rf supabase/functions/ip-check
#
# The function answers with booleans only (never an IP address).
set -uo pipefail
URL="${SUPABASE_URL:-$(grep -E '^VITE_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"'\''')}"
KEY="${SUPABASE_ANON_KEY:-$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"'\''')}"
[[ -z "${CRON_SECRET:-}" || -z "$URL" ]] && { echo "Set CRON_SECRET (and fill .env)." >&2; exit 2; }
FAKE=203.0.113.77   # TEST-NET-3: never a real client

call() {
  curl -s -X POST "${URL%/}/functions/v1/ip-check" -H "apikey: $KEY" -H "x-cron-secret: $CRON_SECRET" \
    -H 'Content-Type: application/json' "$@" --data "{\"forged\":\"$FAKE\"}"
}
plain=$(call); echo "Plain request:  $plain"
forged=$(call -H "X-Forwarded-For: $FAKE" -H "X-Real-IP: $FAKE" -H "CF-Connecting-IP: $FAKE" -H "True-Client-IP: $FAKE")
echo "Forged headers: $forged"
echo
grep -q '"ok":true' <<<"$plain" || { echo "ABORT: ip-check did not answer (deployed? CRON_SECRET right?)"; exit 2; }
status=0
if grep -q '"chosenIsUnknown":true' <<<"$plain"; then
  echo "FAIL: no client IP header reaches the functions, so only the browser counter rate-limits."
  echo "      Pick a header marked present:true in the plain request, then:"
  echo "      npx supabase secrets set CLIENT_IP_HEADER=<that header>"
  status=1
fi
if grep -q '"chosenIsForged":true' <<<"$forged"; then
  echo "FAIL: the IP used for rate limits can be forged. Pick a header that is present:true but"
  echo "      firstIsForged:false above, then: npx supabase secrets set CLIENT_IP_HEADER=<that header>"
  status=1
fi
[[ $status -eq 0 ]] && echo "PASS: a real client IP is used and the forged value was not."
echo "Now delete the function: npx supabase functions delete ip-check && rm -rf supabase/functions/ip-check"
exit $status
