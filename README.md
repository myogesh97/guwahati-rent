# guwahati-rent

An anonymous, crowdsourced rent map for Guwahati. **Read [SPEC.md](SPEC.md) (v2) first**, starting with §0. It covers scope, security rules, schema and build order.

**Status:** Phases 0–1 live. Phase 2a (To-Let boards) committed. Phase 2 (trust, stats, filters, monsoon layer, list view) built and tested locally, not yet deployed. Phase 2b (survey import) is not built yet.

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

## Phase 2a: To-Let photo boards (migrations 0004 + 0005)

Anyone can photograph a To-Let board: **Spot a To-Let** (header on desktop, "To-Let board" button on phones) opens the camera, the photo is compressed in the browser (`src/ui/image.ts`: 1280 px WebP + 320 px thumb, JPEG if the browser can't write WebP, metadata stripped), the location comes from GPS (or a tap on the map), then Turnstile → `tolet-upload-url` → two signed uploads → `submit-tolet`. Boards stay private until approved on `/admin.html`, expire after 60 days, and are hidden after 3 "Board is gone" reports. `tolet-maintenance` (nightly via pg_cron) deletes expired/rejected/gone rows **and** their files.

Deploy in this order:

1. **Vault secrets** (SQL editor, never in a migration). Skip `project_url` if it already exists:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
   ```
2. `npx supabase secrets set CRON_SECRET=<the same value>` (generate with `openssl rand -hex 32`).
3. `npx supabase db push` (applies `0004_tolet_and_survey.sql`, then `0005_tolet_cron.sql`).
4. Deploy the functions, each with `--no-verify-jwt`: `tolet-upload-url`, `submit-tolet`, `report-tolet`, `admin-review`, `tolet-maintenance`.
5. Supabase → Authentication → URL Configuration: add `http://localhost:5173/admin.html` and `https://<your-site>.netlify.app/admin.html` to Redirect URLs.
6. Open `/admin.html`, request a login link for your email, open it, then in SQL:
   `insert into admins (user_id) select id from auth.users where email = '<your email>';`
7. Commit, push, Netlify redeploys. Then re-run `npm run security-check` (now includes the Phase 2a checks).

Until step 3 the map simply shows no boards (the old `public_tolet` view has different columns; the app logs a warning and carries on).

## Phase 2: trust, stats, filters, monsoon layer, list view (migrations 0006 + 0007)

- **Report a pin** (flag button on other people's pins): reason + optional private note, Turnstile, 10/day, one report per pin per browser. 3 open reports from different browsers auto-hide a pin (`status = 'hidden'`) until an admin decides. `admin.html` → **Reported pins**: **Keep** (restore, close reports) or **Remove** (archive). Every admin decision, including To-Let approvals, goes to `moderation_log`. Notes are deleted 90 days after a report is resolved (`cleanup()`).
- **"Not available"** box on every rent pin card.
- **Rent double-check**: over 2× the area median (5+ rents of that BHK there) asks "Is it correct?".
- **Filters** (`src/filters.ts`, URL-synced, shareable). Default "posted within" is **18 months**; older rents stay reachable with "All".
- **Stats** dialog: medians only, 3+ rents per group, last 18 months (`0007_stats_recency.sql`).
- **Monsoon waterlogging** heatmap toggle with a legend; `?water=1` opens it.
- **Map / List**: an accessible, sortable table of the same filtered rents (`?view=list`).
- **Edit your own pin**: `edit-pin` action `update`, same validation as `submit-pin` (shared in `_shared/pin-fields.ts`).

Deploy in this order:

1. `npx supabase db push` (applies `0006_reports_moderation.sql`, then `0007_stats_recency.sql`).
2. `npx supabase functions deploy report-pin --no-verify-jwt`, then redeploy `edit-pin`, `submit-pin` and `admin-review` (all `--no-verify-jwt`).
3. Commit, push, Netlify redeploys.
4. Re-run `npm run security-check` with the test rows **and** the test report from the script header.

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
- **To-Let entry point:** NEXT-PHASES §2a.1 says to enable a choice in `#dlg-add`, but that chooser was removed earlier (desktop: click the map; phones: the button). "Spot a To-Let" is therefore its own button next to "Pin your rent".
- **Look:** deep teal brand (`#0b5566`) with an orange action colour (`#d14400`) and amber for water/monsoon warnings and To-Let signs. The basemap is Protomaps `light` in its natural colours; the UI never filters or tints the map.
- **Demo mode** is a dev-only, in-browser fixture. It is deliberately not a database seed because SPEC §5.13 says "never invent seed data".

- Reads use plain `fetch` to PostgREST instead of supabase-js (main bundle is ~7 KB gzipped vs a 60 KB budget). supabase-js stays a dependency for the Phase 4 admin page.
- Zod runs in the Edge Functions only. Shared rules (bbox, plausibility bands) live in `supabase/functions/_shared/rules.ts`, which both the browser and Deno import.
- Edge Functions import with `npm:` specifiers (no import map needed). `supabase/config.toml` sets `verify_jwt = false` for public functions (they do their own Turnstile + rate limiting; also required for `sb_publishable_` keys).
- Tiles served from the site itself (3.1 MB) instead of R2; glyphs/sprite self-hosted now rather than in Phase 4.
- Waterlogging / water / power fields are in the Phase 1 form (cheap, and the core differentiator).
- `typescript-eslint` added (ESLint can't parse TS without it); `vite.config.ts` excluded from `tsc` (needs `@types/node`).
