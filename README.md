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
npm run typecheck && npm run lint && npm run build
```

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

## Deploy (Netlify)

`netlify.toml` is ready (build `npm run build`, publish `dist`, Node 22). In Netlify: **Add new site → Import from Git → this repo**, then Site configuration → Environment variables:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile site key (add the netlify.app hostname to the widget's allowed domains) |
| `VITE_SITE_URL` | `https://<your-site>.netlify.app` |

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

- Reads use plain `fetch` to PostgREST instead of supabase-js (main bundle is ~7 KB gzipped vs a 60 KB budget). supabase-js stays a dependency for the Phase 4 admin page.
- Zod runs in the Edge Functions only. Shared rules (bbox, plausibility bands) live in `supabase/functions/_shared/rules.ts`, which both the browser and Deno import.
- Edge Functions import with `npm:` specifiers (no import map needed). `supabase/config.toml` sets `verify_jwt = false` for public functions (they do their own Turnstile + rate limiting; also required for `sb_publishable_` keys).
- Tiles served from the site itself (3.1 MB) instead of R2; glyphs/sprite self-hosted now rather than in Phase 4.
- Waterlogging / water / power fields are in the Phase 1 form (cheap, and the core differentiator).
- `typescript-eslint` added (ESLint can't parse TS without it); `vite.config.ts` excluded from `tsc` (needs `@types/node`).
