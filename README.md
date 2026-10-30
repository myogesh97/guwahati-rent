# guwahati-rent

An anonymous, crowdsourced rent map for Guwahati. **Read [SPEC.md](SPEC.md) (v2) first**, starting with §0. It covers scope, security rules, schema and build order.

**Status:** Phase 1 (map + rent pins) built and tested locally. Next: connect Supabase, deploy, seed ~50 real pins, then Phase 2.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
```

With no `.env` the map works in **read-only mode** (no pins, "Pin your rent" disabled). That's also how the first Netlify deploy will look until Supabase is connected.

To enable pinning, copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API; the anon / publishable key, **never** the service role / secret key). In `npm run dev` without a Turnstile key, Cloudflare's always-pass test key is used automatically.

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm test` runs the unit tests (shared rules + the `full` demo dataset) with Node's built-in runner via `tsx`.

### Demo mode (development only)

`npm run dev`, then open one of:

| URL              | Fictional pins | Purpose                                                                                                        |
| ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `/?demo=normal`  | 25             | normal density                                                                                                 |
| `/?demo=dense`   | 80             | many pins per area, 8 spots shared by 2+ pins                                                                  |
| `/?demo=stress`  | 260            | stress test, 32 shared spots                                                                                   |
| `/?demo=crowded` | 1,000          | crowded city, 20% of pins share a building                                                                     |
| `/?demo=packed`  | 5,000          | very crowded                                                                                                   |
| `/?demo=max`     | 20,000         | the most SPEC §8.4 expects to load at once                                                                     |
| `/?demo=full`    | 500            | every pin is a complete form submission that follows all the form rules (checked by `tests/demo-data.test.ts`) |

Every demo pin is generated in the browser by `src/demo/demo-data.ts` (deterministic: same scenario, same pins). Nothing is written to any database, so there is nothing to clean up: remove `?demo=` (or click **Exit demo**). A banner says DEMO MODE, every pin card says **DEMO — NOT A REAL RENTAL**, real pins are not loaded, and adding pins is off. The whole branch sits behind `import.meta.env.DEV`, so production builds contain no demo data, banner or QA hook (verify: `grep -r "demoPins\|__grMap" dist/` is empty).

## Map tiles and assets

- `public/tiles/guwahati.pmtiles`: Protomaps build 20260922 (schema v4), bbox `91.55,26.05,91.95,26.25`. Served from this site; no R2 needed for now.
- `public/map-assets/`: self-hosted fonts + sprite (see its README). The map has no third-party runtime dependency except Cloudflare Turnstile on forms.
- `src/tiles.ts` uses range requests and falls back to downloading the whole 3 MB file once if a host ignores them, so the map can't go blank on hosts without range support.

## Supabase setup (one time)

1. Create the project (region Mumbai). Dashboard → Database → Extensions: enable **postgis**, **pg_cron**, **pg_net**.
2. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   `0002_cron.sql` needs pg_cron + pg_net. Its digest job reads Vault secrets created in Phase 3 (SPEC §6.3); it's harmless before then.
3. **Security gate:** in the SQL editor insert the test rows from SPEC §15 Phase 0, then:
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon-or-publishable-key> npm run security-check
   ```
   Every line must say PASS (exit 0). A server error or unreachable project ABORTs instead of passing. Delete the test rows afterwards.
4. Function secrets, then deploy:
   ```bash
   npx supabase secrets set TURNSTILE_SECRET_KEY=... HASH_SALT="$(openssl rand -hex 32)" \
     ALLOWED_ORIGINS=http://localhost:5173,https://<your-site>.netlify.app
   npx supabase functions deploy submit-pin
   npx supabase functions deploy edit-pin
   ```
   `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` are only needed from Phase 3.

## Migration 0003: living conditions (water, monsoon detail, power cuts, maintenance)

Additive only: new nullable columns on `pins` plus three consistency constraints, and `public_pins` re-created with the new columns **appended** (grants kept). Existing pins are untouched and read as "not reported". `waterlogging` stays and is now derived by `submit-pin` from the detailed answer, so the heatmap/stats (SPEC §8.3) keep working.

Deploy in this order, or new submissions fail until the next step is done:

1. `npx supabase db push` (applies `0003_living_conditions.sql`)
2. `npx supabase functions deploy submit-pin`
3. Netlify deploy of the frontend

The frontend reads `public_pins?select=*`, so the map keeps loading even if step 3 happens before step 1.

## Deploy (Netlify)

`netlify.toml` is ready (build `npm run build`, publish `dist`, Node 22). In Netlify: **Add new site → Import from Git → this repo**, then Site configuration → Environment variables:

| Variable                  | Value                                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`       | `https://<ref>.supabase.co`                                                       |
| `VITE_SUPABASE_ANON_KEY`  | anon / publishable key                                                            |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile site key (add the netlify.app hostname to the widget's allowed domains) |
| `VITE_SITE_URL`           | `https://<your-site>.netlify.app`                                                 |

Redeploy after changing variables (they're baked in at build time).

## Tested (Phase 1)

Against a local Postgres 16 + PostGIS with Supabase's roles and default grants, PostgREST, the real Edge Functions in Deno, and the site in Chromium (Pixel 7 viewport):

- Migration applies cleanly; all security-gate checks pass, including tables created **later** (default privileges) and a negative control (a deliberately leaked contacts table is caught).
- Matching, dedupe, rate limits, 3-report auto-hide, cleanup and outlier flagging behave as specified.
- submit-pin: valid pin accepted; bad Turnstile, outside Guwahati, implausible rent and junk input rejected; coordinates stored rounded to 3 dp; locality assigned; rate limit 5/day.
- edit-pin: wrong token rejected, right token deletes; contact rows removed.
- Browser: welcome → place pin → client-side rent check → submit → WhatsApp share → refresh via `/?pin=<id>` → only your pin shows Delete → delete. No console errors.

Not testable from the build machine: real Cloudflare Turnstile (stubbed locally), a real Supabase project, Netlify's range-request behaviour (the fallback covers it), real phones on 4G.

## Deviations from the spec

- **Living-condition fields (migration 0003)** go beyond SPEC §6.1, at the owner's request. They are optional, carry no contact data, and are shown as "renter-reported, not verified". Rules shared by the form and `submit-pin` live in `_shared/rules.ts` (`pruneConditions`, `conditionProblems`, `waterlogSummary`).
- **flatpickr** (MIT, ~15 KB gzipped) was added beyond SPEC §16 at the owner's request, for the "when did you last see these conditions" calendar. It is loaded on demand (its own chunk), only when the rent form opens. Dropdowns were replaced by option chips instead of a dropdown library.
- **Results panel / phone sheet** (rents in the current map view, medians per BHK from 3+ pins) is the SPEC §8.6 list view, built ahead of Phase 2 at the owner's request. Filters are still Phase 2.
- **Look:** clean neutral palette (near-black + white) with one accent, burnt orange `#c2410c`, used only for actions and your/selected pin. Water and monsoon warnings use amber. Basemap flavour is Protomaps `white`.
- **Demo mode** is a dev-only, in-browser fixture. It is deliberately not a database seed because SPEC §5.13 says "never invent seed data".

- Reads use plain `fetch` to PostgREST instead of supabase-js (main bundle is ~7 KB gzipped vs a 60 KB budget). supabase-js stays a dependency for the Phase 4 admin page.
- Zod runs in the Edge Functions only. Shared rules (bbox, plausibility bands) live in `supabase/functions/_shared/rules.ts`, which both the browser and Deno import.
- Edge Functions import with `npm:` specifiers (no import map needed). `supabase/config.toml` sets `verify_jwt = false` for public functions (they do their own Turnstile + rate limiting; also required for `sb_publishable_` keys).
- Tiles served from the site itself (3.1 MB) instead of R2; glyphs/sprite self-hosted now rather than in Phase 4.
- Waterlogging / water / power fields are in the Phase 1 form (cheap, and the core differentiator).
- `typescript-eslint` added (ESLint can't parse TS without it); `vite.config.ts` excluded from `tsc` (needs `@types/node`).
