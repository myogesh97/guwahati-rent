# Production Test Results

**Date:** 12 Nov 2026 · **Code:** `b8181bd` + uncommitted production-readiness changes (see [CHANGELOG.md](CHANGELOG.md)) · **Machine:** macOS, Node 24.21, npm 11.19, Deno 2.9.8, PostgreSQL 18.6 + PostGIS (Homebrew), Google Chrome (headless, SwiftShader software GL).

**Labels:**
- **PASS / FAIL:** the check was executed.
- **NOT RUN:** not executed.
- **BLOCKED:** cannot run without something outside this repo.
- **NOT VERIFIED:** set up but its result has not been observed.

Nothing in this file was run against production except the read-only probes in §6. Every browser test **blocks all writes to Supabase**.

## Summary

| Suite | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | **PASS** (exit 0) |
| Lint | `npm run lint` | **PASS** (exit 0, no findings) |
| Node unit tests | `npm test` | **PASS 40 / 40** |
| Deno unit tests (Edge Function helpers) | `npm run test:deno` | **PASS 14 / 14** (8 existing + 6 new) |
| Database integration | `npm run test:db` | **PASS 80 / 80** (+ negative control, §3) |
| Production build | `npm run build` | **PASS** (vite 6.4.5) |
| Browser smoke (6 viewports + 7 demo modes) | `npm run test:browser` | **PASS 207 / 207**, 0 FAIL, 24 INFO measurements |
| Dependency audit (runtime) | `npm audit --omit=dev` | **PASS** (0 vulnerabilities) |
| Dependency audit (all) | `npm audit` | 7 moderate, all in `typescript-eslint` → `minimatch` (lint tooling only) |
| Bundle hygiene | `ls dist/assets/*.map`; `grep -rlE "demoPins\|__grMap" dist`; `grep -rlE "sb_secret_[A-Za-z0-9]{10,}\|SUPABASE_SERVICE_ROLE_KEY=" dist` | **PASS**: 0 source maps, 0 demo files, 0 secret files |
| **Total executed** | | **341 PASS, 0 FAIL** |

## 1. Unit tests

`npm test` (Node, `node --test` via tsx): 40 tests covering:
- shared rent bands and condition rules;
- the contact-info filter (M-3);
- filters ↔ URL round-trip;
- the rent double-check;
- image byte inspection (EXIF/GPS/XMP);
- the survey importer (CSV parsing, mapping, deterministic jitter, idempotency);
- the two locality lists being identical;
- demo dataset validity;
- migration text invariants.

`npm run test:deno`, 14 tests:
| Test | Result |
|---|---|
| clientIp prefers platform headers; `CLIENT_IP_HEADER` pins one; `ipHash` null for unknown | PASS (×3, existing) |
| saltedHash refuses without `HASH_SALT`; safeEqual/randomToken; coordinates 3 dp/4 dp; storage paths/EWKB; PinFields + checkPin | PASS (×5, existing) |
| **rateLimitKeys:** IP + browser keys in the old format; an unknown IP never shares a bucket | PASS (new) |
| **turnstile:** valid token passes and forwards the IP | PASS (new) |
| **turnstile:** unknown IP not sent as `remoteip` | PASS (new) |
| **turnstile:** failure / empty token / HTTP 500 / foreign host / foreign action refused | PASS (new) |
| **turnstile:** empty action (test keys) accepted on our host | PASS (new) |
| **turnstile:** missing secret throws (never a silent pass) | PASS (new) |

## 2. Edge Function handlers

| What | Result |
|---|---|
| Handler-level tests (`submit-pin`, `edit-pin`, `report-pin`, `tolet-*`, `admin-review`) against a running stack | **BLOCKED**: needs `supabase start` (Docker is not installed here) or a staging project |
| `deno check` of the new `scripts/diagnostics/ip-check/index.ts` | PASS |
| `ip-check` diagnostic + `check-client-ip.sh`, run locally with Deno | PASS. Wrong secret → 401. Responses contain booleans only. With no proxy, the script correctly reports both "IP unknown" and "IP forgeable" (FAIL is the expected local result). |
| `check-client-ip.sh` against production | **NOT RUN** (needs the function deployed temporarily) |

## 3. Database integration (`npm run test:db`)

A throwaway cluster (`initdb` in a temp dir, Unix socket only) with:
- Supabase's roles (`anon`, `authenticated`, `service_role`);
- **Supabase's permissive default grants** (anon/authenticated get everything on new public objects unless revoked);
- stubs for `auth.users`, `storage.buckets`, `cron`, `vault` and `net`.

All 9 migrations are applied in order, then:

| Group | Checks | Result |
|---|---|---|
| Migrations 0001–0009 apply to a fresh DB | 1 | PASS |
| anon **and** authenticated: cannot read 12 private tables; cannot INSERT pins / UPDATE pins / DELETE pin_contacts / INSERT reports; cannot execute `run_matching`, `cleanup`, `flag_outliers`, `hit_rate_limit` | 2 × 20 | PASS |
| anon **and** authenticated: can read the 5 public views and execute `area_stats` | 2 × 6 | PASS |
| RLS on every public table; 0 policies; `public_pins` / `public_tolet` expose no private column; a table created **after** the migrations is still private; 0 base-table grants to anon/authenticated | 6 | PASS |
| Median not average (12000 vs 17333); 18-month window in stats; old pins still on the map; n < 3 hidden (views **and** `area_stats`); `area_stats` median; city stats | 8 | PASS |
| 0009: waterlogging share counts only answered (50 %); `flag_outliers` flags > 3× median at n ≥ 5; outliers excluded from stats; 0009 clears the flag below n = 5 | 4 | PASS |
| Reports: 2 don't hide; same browser twice refused; same IP + new browser refused (0008); 3 distinct → `hidden:3`; hidden pin leaves `public_pins`; report messages in no public view | 6 | PASS |
| `public_tolet`: only approved, unexpired, < 3 gone; `hit_rate_limit` true,true,false; `cleanup()` prunes; 0009 leaves only `cleanup`, `flag-outliers`, `tolet-maintenance`; buckets private/public, 512 KB, webp/jpeg | 5 | PASS |
| **Total** | **80** | **80 PASS** |

**Negative control** (run once, in a scratch copy): adding a migration with `grant select on public.pins to anon` plus a `using (true)` policy produced **77 passed, 3 failed** ("anon cannot read pins", "no RLS policies", "no grants to anon"). The test catches real leaks.

**Limits:**
- Local Postgres is **18** (Supabase runs 17).
- `cron`, `vault`, `net`, `auth` and `storage` are stubs, so this proves the SQL and grants, **not** pg_cron scheduling or Storage API behaviour.
- The CI job `database` (Postgres 16 + PostGIS on GitHub) was added but **NOT VERIFIED**: it runs only on push.

## 4. Browser smoke (`npm run test:browser`)

`vite preview` serves the production build, with the **CSP from `netlify.toml` injected into every document**. `vite` (dev) is used for demo modes. Every Supabase write is blocked; reads of the public views go to the live project, as the site does.

### 4.1 Production build, per viewport

Each viewport ran: welcome dialog · map renders · real pins load · no horizontal scroll · floating controls don't overlap · touch targets ≥ 44 px (touch viewports) · add button · Map → List · list row → pin card (focus in) · Esc (focus back) · List → Map · Filters → URL · Stats medians · monsoon toggle + legend + URL · empty state + Clear filters · To-Let dialog (submit disabled without a photo) · LCP · CLS · INP proxy · CSP violations · app console errors · failed requests · no write attempts.

| Viewport | Functional checks | Map ready | LCP | CLS | Slowest interaction | Longest task | CSP violations | Console errors | Failed requests |
|---|---|---|---|---|---|---|---|---|---|
| 375 × 812 (touch) | all PASS | 2,315 ms* | 228 ms | 0.000 | < 16 ms | 85 ms | 0 | 0 | 0 |
| 390 × 844 (touch) | all PASS | 421 ms | 752 ms | 0.000 | < 16 ms | 66 ms | 0 | 0 | 0 |
| 430 × 932 (touch) | all PASS | 950 ms | 176 ms | 0.000 | < 16 ms | — | 0 | 0 | 0 |
| 768 × 1024 (touch) | all PASS | 1,092 ms | 336 ms | 0.000 | < 16 ms | 332 ms | 0 | 0 | 0 |
| 1366 × 768 (mouse) | all PASS | 978 ms | 72 ms | 0.005 | < 16 ms | 476 ms | 0 | 0 | 0 |
| 1440 × 900 (mouse) | all PASS | 613 ms | 88 ms | 0.004 | < 16 ms | 68 ms | 0 | 0 | 0 |
| `?demo=max` on the production build | demo ignored, real pins shown | | | | | | | | |

\* The first page also pays for the cold start of Chrome and the preview server. "Map ready" includes clicking through the welcome dialog.

INFO (not a failure): the map's attribution links "Protomaps" and "OpenStreetMap" are 14 px tall. They are inline credit text, which WCAG 2.5.8 exempts. Every other control on touch viewports is ≥ 44 px.

### 4.2 Demo modes (dev server; demo exists only there)

| Scenario | Pins | 390 × 844 | 1366 × 768 | Filter (2 BHK) | List render / paint | Heap |
|---|---|---|---|---|---|---|
| normal | 25 | PASS | PASS | 0.7–1.4 ms | 0.9–1.4 / 13–30 ms | 16–18 MB |
| dense | 80 | PASS | PASS | 1.3–1.4 ms | 2.2 / 20 ms | 17–18 MB |
| stress | 260 | PASS | PASS | 1.3–1.6 ms | 3.2–3.7 / 20–28 ms | 14–18 MB |
| crowded | 1,000 | PASS | PASS | 1.6–1.7 ms | 4.3–4.4 / 18–22 ms | 18–19 MB |
| packed | 5,000 | PASS | PASS | 2.3–2.6 ms | 4.5–4.7 / 21–24 ms | 21 MB |
| max | 20,000 | PASS | PASS | 6.5–6.9 ms | 5.3–5.4 / 20–31 ms | 34–41 MB |
| full | 500 | PASS | PASS | 1.0–1.6 ms | 2.9–4.5 / 21–29 ms | 14–18 MB |

Per scenario and viewport: demo pins on the map · DEMO banner + adding pins off · **0 DOM markers** (one GeoJSON source) · filter < 50 ms and list painted < 100 ms · 0 console errors.

The list shows 100 rows, then "Show more". Measurements are taken after the map's first frames settle. **Measured immediately after "map ready", list paint took 200–570 ms**, because software GL was still drawing the map; on a real phone with GPU rendering this is expected to be smaller, but that is NOT VERIFIED.

Two harness bugs were found and fixed during the run; neither was an app defect:
- the browser profile was shared between viewports (consent persisted);
- filter inputs were clicked inside a dialog that had never been opened.

### 4.3 Not covered by the browser suite

| What | Status | Why |
|---|---|---|
| Submit a rent, edit, delete, report, To-Let upload/approve | **BLOCKED** | Writes are blocked on purpose (production backend). Needs a local Supabase stack or staging project. |
| Real Turnstile solve | **BLOCKED** | The production site key isn't valid on localhost |
| Lighthouse (mobile) | **NOT RUN** | Must run against the live URL (and installing the CLI wasn't allowed here) |
| Real phones / 4G / budget Android | **NOT RUN** | Needs devices |
| Screen readers (VoiceOver/TalkBack) | **NOT RUN** | Manual |
| Image compression sizes and EXIF stripping in a browser | **NOT RUN** | The server-side byte check is unit-tested; the browser pipeline isn't automated |

## 5. Other checks

| Check | Result |
|---|---|
| Backup workflow guard: 6 synthetic URLs (empty, wrong scheme, direct IPv6 host, transaction pooler, password placeholder, valid session pooler) | PASS: 5 refused with the right message, valid one accepted. YAML parses. |
| `weekly-backup` against the real secret | **BLOCKED** (needs the GitHub secret fixed, then a run) |
| JSON-LD in `dist/index.html` parses, URL substituted | PASS |
| `.env` in git history / secret-shaped strings in history | PASS (none) |
| Full `npm run security-check` (write probes) against production | **NOT RUN** (production writes are not allowed in this task) |

## 6. Read-only production probes (same session, before any change)

| Probe | Result |
|---|---|
| `supabase migration list` | 0001–0008 applied |
| `supabase functions list` | 8 ACTIVE, `verify_jwt=false` |
| `supabase secrets list` (names) | `TURNSTILE_SECRET_KEY`, `HASH_SALT`, `ALLOWED_ORIGINS`, `CRON_SECRET`; no `CLIENT_IP_HEADER` |
| Live headers | CSP, X-Frame-Options DENY, HSTS preload, nosniff, Referrer-Policy, Permissions-Policy |
| Anon GET on 12 private tables | 401 each |
| `public_pins` | 8 pins, 6 localities, all `source=user`, max 3 decimal places, no private columns |
| GitHub Actions | `ci` green; `weekly-backup` failed; `keepalive`, `nightly-rebuild` succeeded |
