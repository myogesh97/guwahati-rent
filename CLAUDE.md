# guwahati-rent

Read `SPEC.md` (v2) first, starting with section 0. It is the single source of truth for scope, stack, schema and build order.
Work one phase at a time (section 15) and stop with a report after each. NEXT-PHASES.md (newer, overrides SPEC) sets the order 2a → 2b → 2. Phases 0, 1, 2a and 2 are live (migrations 0001–0006 on the live DB). Migration 0008 + the security fixes in SECURITY_AUDIT_REPORT.md, and the P0/P1 items in PROJECT_GAP_ANALYSIS.md, are in the tree but not deployed; follow DEPLOY.md for order. Phase 2b's importer (scripts/import-survey.ts) is built; Phase 3 (listings, seekers, email) is next.
Follow section 5 ("Security rules") without exception, especially:

- anon key never reads email/phone; all writes go through Edge Functions
- Turnstile on every public form, verified server-side
- coordinates rounded to 3dp server-side
- no community/religion/caste/ethnicity fields, ever
- medians not averages; single GeoJSON source, never DOM markers per pin
