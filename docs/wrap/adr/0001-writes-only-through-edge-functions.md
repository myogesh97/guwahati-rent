# ADR 0001: All writes go through Edge Functions; anon reads only views

- Status: accepted (in effect since Phase 0) · Recorded: 26 Nov 2026 (retroactive)

## Context
The site has no user accounts. Anyone can submit, so every write needs bot checks, rate limits and server-side rounding of coordinates. Supabase lets the anon key write through RLS policies, but policies can't call Turnstile or round values reliably.

## Decision
Revoke every table privilege from `anon` and `authenticated` (`0001_init.sql:375-382`, including default privileges for future tables). Grant SELECT only on `public_*` views and EXECUTE only on `area_stats`. All writes go through 8 Edge Functions using the service role, each doing zod validation → Turnstile → rate limit → write.

## Consequences
- RLS has no policies at all; the protection is the grants. `tests/db/run.sh` and `scripts/security-check.sh` must keep asserting them.
- Functions run with `verify_jwt = false` (needed for `sb_publishable_` keys) and must protect themselves.
- Any new table is private by default.
