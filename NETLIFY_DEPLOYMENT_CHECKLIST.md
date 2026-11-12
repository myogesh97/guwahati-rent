# Netlify Deployment Checklist: 12 Nov 2026

> **Headline: there is nothing left to deploy.** `91fde5d`, the current `main` and `origin/main`, is already live on all three tiers: database, Edge Functions and frontend. What remains is post-release verification, a broken backup job and documentation. Details are in §10 and §13.

## 1. Git branch

`main` is the only branch. Local `main` equals `origin/main`. Remote: `github.com/myogesh97/guwahati-rent`.

## 2. Latest commit

`91fde5d` "Remove temporary ip-check function config" (12 Nov 2026, 16:50 IST). Its parent is `c258588` "Security fixes, report-abuse migration, SEO/a11y, survey importer, CI".

Uncommitted after this audit:

- `CHANGELOG.md` (new)
- `NETLIFY_DEPLOYMENT_CHECKLIST.md` (new)
- `.env.example` (documentation fix)

## 3. Files changed

`a5909dc..91fde5d`: 49 files, 17 added, 32 modified, 0 deleted, 0 renamed. Per-file detail is in `CHANGELOG.md`.

## 4. Build result

| Check                                   | Result                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                     | PASS                                                                                                           |
| `npm run lint`                          | PASS                                                                                                           |
| `npm run build`                         | PASS: 6 HTML entries plus `robots.txt` and `sitemap.xml`. Map chunk 1,163 KB (317 KB gzip), lazy-loaded.       |
| Source maps in `dist/`                  | PASS: none emitted.                                                                                            |
| Secrets in `dist/`                      | PASS: no `sb_secret_` key or service-role string. The only pattern hit is supabase-js's own prefix-check code. |
| Demo code in `dist/`                    | PASS: no `demoPins` or `__grMap`. `?demo=max` on the live site shows real pins and no banner.                  |
| `console.log`/`debug` in public bundles | PASS: none in `main` or `api`.                                                                                 |
| GitHub `ci` workflow                    | PASS on `c258588` and `91fde5d`.                                                                               |

## 5. Test results

**Automated suites**

| Suite                              | Result      |
| ---------------------------------- | ----------- |
| `npm test` (Node)                  | PASS, 40/40 |
| `npm run test:deno` (Edge helpers) | PASS, 8/8   |

**Browser QA.** Headless Chrome. Every request to `/functions/v1/` and every non-GET to Supabase was blocked, so nothing was written to production. 0 write attempts were made.

| Area                                                                                                                                       | Result                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Live homepage, map canvas, pins from the production API ("8 rents pinned")                                                                 | PASS                                                                                                                                   |
| Live: runtime errors, failed requests                                                                                                      | PASS (0 / 0)                                                                                                                           |
| Live: CSP violations                                                                                                                       | **FAIL, 1 violation, not app code:** Netlify's injected `nl-badge-frame`. With `/.netlify/scripts/hud` blocked there are 0 violations. |
| Full-colour basemap (water, parks, labels)                                                                                                 | PASS visually. NOT VERIFIED against an earlier screenshot (no baseline exists).                                                        |
| Map → List → Map; list row opens the rental detail                                                                                         | PASS                                                                                                                                   |
| Filters: open, apply (`?since=6m` written to the URL), clear, close; Stats dialog                                                          | PASS                                                                                                                                   |
| Pin Your Rent: placement mode → spot → form; empty submit blocked ("Enter your monthly rent…"); phone number in one-liner rejected         | PASS                                                                                                                                   |
| Spot a To-Let: image select → preview in 175 ms; Remove photo → preview gone, focus returns to the picker; submit disabled without a photo | PASS                                                                                                                                   |
| Phone, 390 px: no horizontal scroll; bottom Pin/Spot buttons visible; To-Let dialog fits                                                   | PASS                                                                                                                                   |
| Links in all built pages; unknown path returns 404                                                                                         | PASS                                                                                                                                   |
| `/tiles/guwahati.pmtiles` live (200, `Accept-Ranges: bytes`); `.mjs` worker served as `text/javascript`                                    | PASS                                                                                                                                   |
| Memory: 100 cycles of list/map, filters and To-Let dialog                                                                                  | PASS. Heap after forced GC: 9.3 → 10.1 → 10.1 → 10.2 → 10.2 MB (flat).                                                                 |
| End-to-end submit, report, admin keep/remove against production                                                                            | NOT RUN (deliberately; writes blocked)                                                                                                 |
| Empty, loading and error states                                                                                                            | NOT VERIFIED beyond the code path (`fetchPins` failure toast, map-load error message)                                                  |

**Demo modes** (`npm run dev`, which is the only place demo exists). Desktop 1366×900. Timings are measured, from one run each.

| Scenario | Pins in source | Map ready | Zoom → idle | JS heap | Errors | Add/Spot disabled |
| -------- | -------------- | --------- | ----------- | ------- | ------ | ----------------- |
| normal   | 25             | 789 ms    | 929 ms      | 11.3 MB | 0      | yes               |
| dense    | 80             | 807 ms    | 964 ms      | 11.5 MB | 0      | yes               |
| stress   | 260            | 795 ms    | 915 ms      | 11.8 MB | 0      | yes               |
| crowded  | 1,000          | 995 ms    | 947 ms      | 12.4 MB | 0      | yes               |
| packed   | 5,000          | 846 ms    | 944 ms      | 14.0 MB | 0      | yes               |
| max      | 20,000         | 823 ms    | 944 ms      | 20.6 MB | 0      | yes               |

Demo data cannot reach production. The demo branch and module are gated on `import.meta.env.DEV`, which Vite removes from production builds; CI greps `dist/` for it. In dev, demo mode sets `canAdd = false`, all four add/spot buttons are disabled (verified), and board fetching is skipped.

## 6. Security status

| Check                                            | Result                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env` committed?                                | PASS: gitignored, never tracked. Only `.env.example` is tracked.                                                                                                            |
| Service-role key in frontend                     | PASS: not in `src/` or `dist/`. It is used only by Edge Functions (injected) and the local import script (read from the environment).                                       |
| Turnstile verified server-side                   | PASS: `verifyTurnstile` in `submit-pin`, `report-pin`, `report-tolet` and `tolet-upload-url`. Hostname check added. A production (non-test) site key is in the live bundle. |
| RLS and grants, live, anon key, read-only probes | PASS 17/17: 12 private tables return 401; `public_pins`, `public_tolet` and both stats views expose no private column; `public_pins` coordinates are ≤ 3 dp.                |
| Full `npm run security-check`                    | NOT RUN: it sends write probes (`PATCH pins`, `DELETE pin_contacts`) to production. Run it yourself per `DEPLOY.md` §4.                                                     |
| Edge Function secrets present (names only)       | PASS: `TURNSTILE_SECRET_KEY`, `HASH_SALT`, `ALLOWED_ORIGINS`, `CRON_SECRET`. `CLIENT_IP_HEADER` is not set (see §10).                                                       |
| Deployed functions match the repo                | PASS: 20/20 files byte-identical.                                                                                                                                           |
| Debug output in production                       | PASS: dev hook `__grMap` and demo code stripped; no console logging in public bundles.                                                                                      |
| Live headers                                     | PASS: CSP, HSTS (Netlify adds `includeSubDomains; preload`), `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy.                                       |

## 7. Netlify environment variables

Netlify CLI is not installed and the site is not linked locally, so the dashboard was **not inspected**. The status column is inferred from the live bundle.

| Variable                  | Purpose                                        | Public or private  | Required in production                                       | Live status (inferred)                                                              |
| ------------------------- | ---------------------------------------------- | ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`       | REST/Functions base URL                        | Public (in bundle) | Yes                                                          | Set (pins load)                                                                     |
| `VITE_SUPABASE_ANON_KEY`  | Publishable key; RLS limits it to public views | Public (in bundle) | Yes                                                          | Set                                                                                 |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile widget                               | Public (in bundle) | Yes                                                          | Set (production key present)                                                        |
| `VITE_SITE_URL`           | Canonical, `og:url`, sitemap, robots           | Public             | Yes                                                          | Canonical is `https://guwahati-rent.netlify.app`: either set, or the build fallback |
| `VITE_TILES_URL`          | Override tiles location                        | Public             | No. Leave unset; an external origin also needs a CSP change. | Unset (same-origin `/tiles/`)                                                       |

Server-side only. Never a `VITE_` variable and never in Netlify:

- **Supabase secrets:** `TURNSTILE_SECRET_KEY`, `HASH_SALT`, `ALLOWED_ORIGINS`, `CRON_SECRET`, optional `CLIENT_IP_HEADER`.
- **Supabase Vault:** `project_url`, `cron_secret`.
- **GitHub Actions secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `NETLIFY_BUILD_HOOK_URL`. The keepalive and nightly-rebuild runs succeeded, so their secrets are set; backup failed.

## 8. Database migrations required

**None.** 0001–0008 are applied on production (`supabase migration list --linked`).

## 9. Edge Functions requiring deployment

**None.** All 8 deployed functions match `91fde5d`, and `ip-check` is already deleted.

## 10. Production risks

1. **No working DB backup:** the first `weekly-backup` run failed at `pg_dump`. Open the run log: <https://github.com/myogesh97/guwahati-rent/actions/runs/43210468291>. Check that `SUPABASE_DB_URL` is the Session-pooler string. **Highest priority:** the database has no other rollback.
2. **Post-release smoke test not done:** submissions now go through new server checks (contact info, image metadata, body size, Turnstile hostname). Pin one test rent, upload one test To-Let board, report one pin, then clean up. This confirms Turnstile accepts `guwahati-rent.netlify.app` against `ALLOWED_ORIGINS`.
3. **M-2 result unrecorded:** if `scripts/check-client-ip.sh` was never run (or said FAIL), rate limits may still use a spoofable header. Re-running needs `ip-check` redeployed temporarily.
4. **CSP noise from the Netlify badge:** harmless (blocked), but it hides real violations in monitoring. Look for the setting that injects `/.netlify/scripts/hud` in the Netlify site settings. I did not verify which setting controls it.
5. **Hard-coded coupling:** the CSP pins the Supabase host. Any change of project, tiles origin or custom domain needs the coordinated update listed in `DEPLOY.md` §3.
6. **Stale docs:** `CLAUDE.md`, `README.md` and `DEPLOY.md` §6 say this release is undeployed, which could lead someone to re-run steps.

## 11. Recommended deployment method

The project uses **Git-connected Netlify deployment**: a push to `main` builds `npm run build` → `dist/` (see `netlify.toml` and `DEPLOY.md` §3). There is no Netlify CLI or `.netlify/` link, and none should be added.

What I recommend next. Each step needs your approval:

1. **Commit the audit files** (docs only; no production effect):
   ```bash
   git add CHANGELOG.md NETLIFY_DEPLOYMENT_CHECKLIST.md .env.example
   git commit -m "Release audit: changelog, deployment checklist, .env.example"
   ```
2. **Push**: `git push origin main`. This triggers a Netlify build of the same frontend. To skip that rebuild, put `[skip netlify]` in the commit message; CI still runs.
3. **Tag the live release** so a rollback point exists:
   ```bash
   git tag -a v0.3.0 91fde5d -m "Security fixes + 0008"
   git push origin v0.3.0
   ```
   The version number is a suggestion.
4. **Fix the backup secret**, then re-run `weekly-backup` (Actions → Run workflow).
5. **Run `DEPLOY.md` §4 yourself:**
   - full `npm run security-check`, with its test rows;
   - one test pin and one test board, then delete both.

## 12. Rollback considerations

| Part           | How                                                                                                                | Notes                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Netlify → Deploys → previous deploy → Publish deploy                                                               | Instant. The pre-`c258588` frontend still works against the new backend: 0008 is additive, and the old frontend never calls the new admin actions. |
| Edge Functions | `git checkout a5909dc -- supabase/functions && npx supabase functions deploy --no-verify-jwt`, then restore `main` | The old `report-pin`/`report-tolet` do not write `ip_hash`. The old `tolet-maintenance` deletes boards with 3+ gone reports again.                 |
| Database       | Forward-only. A reversing migration would drop the two indexes and the `ip_hash` columns.                          | **No backup exists yet** (see §10.1).                                                                                                              |

## 13. Approval gate: actions waiting for you

None of these were done:

- push to GitHub;
- create or push a tag;
- trigger a Netlify deploy;
- run migrations;
- deploy or delete Edge Functions;
- change Supabase, Netlify or GitHub secrets;
- run write probes against production.
