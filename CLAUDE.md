# guwahati-rent

Read `SPEC.md` (v2) first, starting with section 0. It is the single source of truth for scope, stack, schema and build order.
**The project is wrapped (26 Nov 2026): no further phases. Phase 3 and Phase 4 are cancelled.** Current status is in STATUS.md, which wins over every other doc on status. Everything built is live: Phases 0, 1, 2a, 2 and 2c on `main` (Netlify, guwahati-rent.netlify.app; no custom domain), migrations 0001–0010 and all 8 Edge Functions on Supabase `ngssgjuagrlyhsvtiwhk` (South Asia, Mumbai), with the 2c.2 functions verified live on 26 Nov. Only do maintenance, bug fixes or wrap-up tasks the owner asks for; do not start new features. Follow DEPLOY.md for order (db, functions, frontend). The demo showcase (VITE_DEMO_SHOWCASE) stays off in production. Before reporting, run: npm run typecheck && npm run lint && npm test && npm run test:deno && npm run test:db && npm run build (and npm run test:browser when the UI changed).
Follow section 5 ("Security rules") without exception, especially:

- anon key never reads email/phone; all writes go through Edge Functions
- Turnstile on every public form, verified server-side
- coordinates rounded to 3dp server-side
- no community/religion/caste/ethnicity fields, ever
- medians not averages; single GeoJSON source, never DOM markers per pin
