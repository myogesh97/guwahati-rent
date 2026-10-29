# guwahati-rent

Read `SPEC.md` (v2) first, starting with section 0. It is the single source of truth for scope, stack, schema and build order.
Work one phase at a time (section 15) and stop with a report after each. Phase 0 and Phase 1 are done (see README "Tested"), plus migration 0003 (living conditions) and a dev-only demo mode. Next is Phase 2.
Follow section 5 ("Security rules") without exception, especially:
- anon key never reads email/phone; all writes go through Edge Functions
- Turnstile on every public form, verified server-side
- coordinates rounded to 3dp server-side
- no community/religion/caste/ethnicity fields, ever
- medians not averages; single GeoJSON source, never DOM markers per pin
