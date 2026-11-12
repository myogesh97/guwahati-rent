# guwahati-rent

Read `SPEC.md` (v2) first, starting with section 0. It is the single source of truth for scope, stack, schema and build order.
Work one phase at a time (section 15) and stop with a report after each. NEXT-PHASES.md (newer, overrides SPEC) sets the order 2a → 2b → 2. Phases 0, 1, 2a and 2 are live; migrations 0001–0008 and all 8 Edge Functions are on production (tag v0.3.0). Migration 0009 and the 12 Nov function changes are deployed (functions redeployed 12 Nov); the frontend part ships as v0.4.0. Follow DEPLOY.md for order. Launch blockers and their status: PRODUCTION_READINESS_REPORT.md. Phase 2b's importer (scripts/import-survey.ts) is built; Phase 3 (listings, seekers, email) is deferred until ~300 real pins (NEXT-PHASES §5). Before reporting, run: npm run typecheck && npm run lint && npm test && npm run test:deno && npm run test:db && npm run build (and npm run test:browser when the UI changed).
Follow section 5 ("Security rules") without exception, especially:

- anon key never reads email/phone; all writes go through Edge Functions
- Turnstile on every public form, verified server-side
- coordinates rounded to 3dp server-side
- no community/religion/caste/ethnicity fields, ever
- medians not averages; single GeoJSON source, never DOM markers per pin
