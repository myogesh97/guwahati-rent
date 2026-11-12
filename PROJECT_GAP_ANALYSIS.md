# Guwahati Rent — Project Gap Analysis & Production Readiness Assessment

**Date:** 12 November 2026 · **Repository state audited:** commit `a5909dc` plus the uncommitted working tree (19 modified files, 6 untracked files) · **Live targets inspected read-only:** `https://guwahati-rent.netlify.app` and the linked Supabase project (public views and CORS preflights only, using the anon key from `.env`).

**Method.** Every source, config, migration, Edge Function, test and document in the repo was read. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm audit` and `deno check` on all 9 functions were run. The production build was served locally and driven with headless Chrome 157 over the DevTools protocol: screenshots at 375×812, 390×844, 430×932, 768×1024, 1366×768 and 1440×900; every dialog state; all seven demo-mode densities; an axe-core 4.10 pass on 13 page states. Evidence files are referenced as `path:line`.

**What could not be verified** (marked NOT VERIFIED throughout): anything requiring the Supabase dashboard, service-role access or the Netlify dashboard (Vault secrets, function secrets, which *version* of each Edge Function is deployed, whether migrations 0007/0008 are applied, bucket limits, deploy previews, env vars). Lighthouse could not be run: the sandbox policy in this session refused to execute the downloaded `lighthouse` package. Real Turnstile could not be exercised locally: the site key is not registered for `127.0.0.1`, so every form showed Cloudflare error 110200 as expected. No writes of any kind were made to the live project.

---

## 1. Executive summary

**Classification: Functional MVP, approaching production candidate. Not production-ready.**

What the evidence shows:

- **The core product works end to end and is already live.** Map (self-hosted PMTiles, no third-party runtime dependency), placement flow, rent form with Guwahati-specific water/monsoon/power fields, server-side validation, edit tokens, delete, edit, report, filters, stats (medians, n ≥ 3, 18 months), monsoon heatmap, accessible list view and the To-Let photo pipeline with admin review are all implemented in the repo, and the live site serves the Phase 2 UI (confirmed by string inspection of the live bundle and `index.html`). The live database has migrations 0001–0006 applied (the `moderation_log` table from 0006 exists: the anon key gets "permission denied", not "relation does not exist").
- **Security posture as written is strong and the live read boundary holds.** Every private table and bucket returned a permission error or an empty list to the anon key; only the five public views and `area_stats()` are readable. No secret exists in the working tree, in `dist/`, or anywhere in git history. All 32 unit tests pass; typecheck, lint, build and `deno check` are clean.
- **But the live deployment is behind the repo in security-relevant ways.** The live site has **no Content-Security-Policy and no frame protection** (the hardened `netlify.toml` is uncommitted). The four medium findings of the 5 Nov security audit (report-bombing via client-chosen browser ids, spoofable rate-limit keys, phone numbers in public free text, clickjacking) are fixed in the working tree but **not committed, not deployed, and migration 0008 is not applied**. Until that lands, a motivated person can hide any pin with three Turnstile solves.
- **Launch-blocking product gaps remain:** 6 real pins in 3 localities (the spec's own launch bar is 150+ pins across 15+ localities); no robots.txt, sitemap, canonical URL, OG image or `<h1>`; the privacy page has a `TODO` where the contact email should be; no backups, keep-alive or error monitoring; no browser or Edge-Function tests; and Phase 2b (survey import) is unbuilt.
- **Documentation is out of date in several places** (README/CLAUDE.md say Phase 2 is "not deployed"; it is; PROJECT_CONTEXT.md describes MapLibre 5, a placeholder admin page and To-Let as "Phase 4"). These are called out in §9.

---

## 2. Feature implementation matrix

Status key: **Complete** = whole workflow verified in code and in the rendered app; **Partial**; **Missing**; **Broken**; **Not verified** = exists in code but could not be exercised here.

### A. Core rental map

| Feature | Expected behaviour | Actual implementation | Status | Evidence |
|---|---|---|---|---|
| Initial map load | MapLibre + PMTiles, lazy-loaded after first paint | Dynamic `import('./map')`; MapLibre 6.16 with worker emitted via `?url` and `setWorkerUrl`; map ready in 330–520 ms locally at all six viewports | Complete | `src/main.ts:322`, `src/map.ts:6,56`; audit-prod.json |
| Guwahati coverage & bounds | Extract bbox 91.55–91.95 / 26.05–26.25, min zoom 10 | `maxBounds` = bbox + margin, `minZoom:10`, `maxZoom:18`; 3.2 MB `guwahati.pmtiles` served from the site; live host answers Range requests with 206 | Complete | `src/map.ts:62-71`, `public/tiles/`, live curl |
| Range-request fallback | Map must not go blank on hosts without Range support | `RangeOrWholeSource` keeps a 200 response in memory | Complete | `src/tiles.ts` |
| Zoom / pan / rotation | 2D only, no rotation | `dragRotate:false`, `touchZoomRotate.disableRotation()`; NavigationControl without compass | Complete | `src/map.ts:73-74,116,122` |
| Glyphs / sprite | Self-hosted before launch | Noto Sans ranges + Protomaps light sprite under `public/map-assets/` | Complete | `src/map.ts:78-81`, `public/map-assets/README.md` |
| Locality labels | From basemap | Basemap `places` layer renders names (Assamese + English for the city label); 30 locality centres in `localities.json` are **not** drawn | Complete (as designed) | screenshots |
| Rental markers | One GeoJSON source + layers, never DOM markers | `pins` source with cluster, `pin-dot` + stretchable price-tag symbols; `markersInDom: 0` at every density | Complete | `src/layers.ts`, `src/map.ts:89-97`; audit-demo |
| Clustering / density | Clusters with count | `cluster:true, clusterRadius:40, clusterMaxZoom:15`; cluster count + `~₹avg` label | Complete, one spec tension | `src/layers.ts:83-140` (the `cluster-avg` label is an **average**; SPEC §5.10 says medians for all rent stats. SPEC §8.3 itself asks for this label, so it is a spec inconsistency, not a bug; see §9) |
| Marker selection | Selected pin highlighted | `pin-selected` ring + `pin-selected-tag`; cleared on dialog close | Complete | `src/map.ts:269-272`, `src/main.ts:219` |
| Same-spot pins | Several rents at one 100 m spot | `openMany` picker sorted by rent | Complete | `src/ui/pin-card.ts:280-305` |
| Rental detail display | Full details on tap, lazy-loaded | Map loads 13 columns; card fetches `select=*` on open; stale-response guard via ticket | Complete | `src/api.ts:28-57`, `src/ui/pin-card.ts:108-118` |
| Map / List switching | Toggle, URL-synced | `view=list` in URL; table reuses sorted copy; verified at 390 and 1440 | Complete | `src/main.ts:79-87`, `src/ui/list-view.ts` |
| Loading / error states | Status pill; failure message | "Loading map…" status; on failure "The map could not load…"; pin fetch failure → toast | Complete | `src/main.ts:321-328` |
| Mobile interactions | FAB on touch, click-to-place on mouse | `(hover:hover) and (pointer:fine)` switch; verified: FABs on 375–768, top-bar buttons + hint on 1366/1440 | Complete | `src/main.ts:101-110`; audit-prod `ui` |
| Deep links | `?pin=<id>`, `?area=<slug>` | Both implemented | Complete | `src/main.ts:374-388` |

### B. Rental submission

| Feature | Expected | Actual | Status | Evidence |
|---|---|---|---|---|
| Pin your rent flow | Place → form → submit → pin appears → share | Centre-pin placement on touch, click-to-place on mouse; form; `submit-pin`; pin inserted into state; WhatsApp share dialog | Complete (code) / **Not verified live** (Turnstile can't run on 127.0.0.1; no test submission was made to production) | `src/main.ts:117-191`, `src/forms/rent-pin.ts:343-442` |
| Location selection | Inside bbox, rounded 3 dp server-side | Client `inGuwahati()`; server re-checks and `round3` before `toWkt` | Complete | `supabase/functions/submit-pin/index.ts:44-56` |
| Rent, type, BHK, furnishing, gated | Required | Required with plausibility bands per type/BHK (SPEC §10) | Complete | `_shared/rules.ts:29-47`, `_shared/pin-fields.ts` |
| Deposit / maintenance / sqft / parking / occupants / PG fields | Optional | Implemented; deposit "looks like rupees" heuristic; maintenance amount only when paid separately (DB CHECK) | Complete | `index.html:376-423,715-797`, `0003_living_conditions.sql:48-50` |
| Water supply | Availability, litres, hours, extra cost, shared, drinking | All present; litres/hours pruned unless scheduled (shared `pruneConditions`) | Complete | `index.html:425-546`, `_shared/rules.ts:120-137` |
| Waterlogging | Where, severity, duration, road access, floor; summary derived server-side | Complete; `waterlogSummary()` never promotes street-only to "enters premises" | Complete | `_shared/rules.ts:98-112`, tests |
| Power | Backup + cut frequency | Complete | Complete | `index.html:686-714` |
| Image upload (To-Let) | Camera → compress → signed upload → submit | Native canvas re-encode (EXIF stripped), WebP→JPEG fallback, two signed PUTs, `submit-tolet` verifies size/MIME/bytes/metadata | Complete (code) / **Not verified live** (needs a phone + admin) | `src/ui/image.ts`, `src/forms/tolet.ts`, `submit-tolet/index.ts:53-86` |
| Image preview / removal | Preview, remove, retake | Canvas preview; "Remove photo" frees canvas; `shot` ticket cancels stale compression | Complete | `src/forms/tolet.ts:79-93,134-173` |
| Form validation | Client + server, field-level errors | Client mirrors server rules; server returns field names; inline + summary errors; first error focused (verified: empty rent → "Enter your monthly rent in rupees.", focus on `rent-amount`) | Complete | `src/forms/rent-pin.ts:174-294`; screenshot `prod-390-rent-form-errors` |
| Submission feedback | Toast / share dialog | Share dialog after add; "Saved" toast after edit; progress text in To-Let | Complete | `src/main.ts:170-187` |
| Duplicate submissions | Not a spec requirement for rent pins | None beyond rate limit; `submit-tolet` is idempotent via `eq('status','uploading')` | Partial (acceptable) | `submit-tolet/index.ts:88-95` |
| Rate limiting | 5/day pins, 30/day edits, 10/day reports, 5/day boards | Implemented per IP **and** per browser id via `hit_rate_limit`; cheap checks run first | Complete (code) / **Not verified live** (key spoofability depends on the platform header; see §4) | `_shared/ratelimit.ts`, each function |
| Edit own pin | Same validation as submit | `edit-pin` `update` reuses `PinFields` + `checkPin`; form pre-fill; location fixed | Complete (code) | `edit-pin/index.ts`, `src/forms/rent-pin.ts:457-497,545-553` |
| Delete own pin | Token-gated archive | Two-tap confirm; SHA-256 constant-time compare; contact row deleted | Complete (code) | `src/ui/pin-card.ts:244-271`, `edit-pin/index.ts:51-61` |
| Rent double-check | > 2× locality median with ≥ 5 pins | Implemented; unit-tested | Complete | `src/double-check.ts`, `tests/double-check.test.ts` |

### C. Rental discovery

| Feature | Expected | Actual | Status | Evidence |
|---|---|---|---|---|
| Filters | Type, BHK, rent range, furnishing, gated, property type, hide water-enters, posted-within | All present; applied live on `input`; rebuild source data so cluster counts match | Complete | `src/filters.ts`, `src/ui/filters-dialog.ts` |
| Filter persistence / sharing | URL query string | `writeFilters` keeps non-default keys; `replaceState`; round-trip tested | Complete | `src/state.ts`, `tests/filters.test.ts` |
| Active count + Clear all | "Filters (n)" | Badge + `aria-label`; Clear all resets | Complete | `src/ui/filters-dialog.ts:62-74` |
| Sort order | List sortable with `aria-sort` | 7 sortable columns, direction toggles, 100-row paging | Complete | `src/ui/list-view.ts` |
| Empty results | Message | "No rents match. Try Clear all…" | Complete | `src/ui/list-view.ts:109-112` |
| List / map consistency | Same filtered array | Both read `state.visible` | Complete | `src/main.ts:51-71` |
| Locality filter | Not in spec | Not implemented (area is reachable via `?area=`) | Missing (not required) | — |

### D. Trust and data quality

| Feature | Expected | Actual | Status | Evidence |
|---|---|---|---|---|
| Anonymous submissions | No login, no name | Confirmed; no PII fields in schema | Complete | `0001_init.sql` |
| Edit tokens | Random, hash stored, plain in localStorage | 256-bit `randomToken`, SHA-256 hash, `gr.editTokens` | Complete | `_shared/crypto.ts`, `src/tokens.ts` |
| Browser id | Random, hashed with salt | `crypto.randomUUID`, `saltedHash` server-side | Complete | `src/tokens.ts:27-35` |
| Duplicate / abuse report resistance | 3 reports → hidden, one per reporter | Unique per `reporter_hash` (0006) **and** per `ip_hash` (0008, uncommitted). Live DB lacks 0008 → still bypassable with made-up browser ids | **Partial on live**, fixed in working tree | `0008_report_abuse.sql`, `report-pin/index.ts:50-57` |
| Spam protection | Turnstile server-side on every public form | Rent, report, board upload, board-gone all verify `siteverify`; hostname check added (uncommitted) | Complete (code) | `_shared/turnstile.ts` |
| Fake-submission resistance | Plausibility bands, outlier flagging | Bands enforced; `flag_outliers()` exists but runs only if the 0002 cron is active | Partial / Not verified | `0001_init.sql:289-303`, `0002_cron.sql` |
| Contact info in public text | SPEC §5.1 | `hasContactInfo` rejects Indian phones/emails in 4 public text fields, server + client (uncommitted, tested) | Complete in working tree, **not live** | `_shared/rules.ts:191-230`, `tests/rules.test.ts` |
| Expired / outdated listings | Boards 60 days; rent pins never deleted but 18-month default | `public_tolet` filters `expires_at`; `since=18m` default; "Expires in N days" on boards | Complete | `0004:49`, `src/filters.ts:24-35`, `src/format.ts:70-76` |
| Coordinate precision | 3 dp rent, 4 dp boards | Enforced server-side | Complete | `_shared/geo.ts` |
| Moderation | Admin keep/remove pins, approve/reject/keep/remove boards, log | All in `admin-review` with `moderation_log` | Complete (code) / Not verified live | `admin-review/index.ts` |
| Report notes retention | Deleted 90 days after resolution | In `cleanup()` (0006) — runs only if cron active | Partial / Not verified | `0006:62-64` |

### E. Guwahati-specific features

| Condition | Schema | Form | Filters | Detail card | Stats / map | Status |
|---|---|---|---|---|---|---|
| Monsoon waterlogging | `waterlogging` + 6 detail columns | Yes/No/Not sure + where/severity/duration/road/floor | "Hide homes where water comes in" | Chips + "Monsoon" rows | Heatmap layer + legend; `pct_waterlog_severe` in locality stats | Complete |
| Water supply reliability | `water_availability`, `water_litres`, `water_hours` | Yes | No | Yes ("Every other day · 500 L…") | No | Complete for data; no filter (not in spec) |
| Water storage | Not modelled | — | — | — | — | Missing (not in spec; `water_litres` partially covers) |
| Power cuts / backup | `power_cuts`, `power_backup` | Yes | No | Yes | No | Complete for data |
| PG accommodation | `pg` type, `pg_meals`, `pg_gender`, own band | Yes | Type filter | Yes | City stats by type | Complete |
| 1RK | `1rk` type, own band, bhk=0 | Yes | Yes ("Room/1RK") | Yes | Yes | Complete |
| Locality-based info | `locality_slug` nearest within 3 km; 30 centres | Shown as "Near X" | No locality filter | Yes | `public_stats_locality` | Partial: centres are unverified placeholders (SPEC §11 [HUMAN]) and duplicated in two files |

Note on `pct_waterlog_severe`: it averages `enters_premises` over **all** pins in the bucket, including `unknown`, so it understates severity where reporting is sparse (`0007_stats_recency.sql:23`). Not wrong, but label it "of reports" or exclude unknowns.

### F. Statistics and insights

| Feature | Expected | Actual | Status | Evidence |
|---|---|---|---|---|
| Median rent | Medians only | `percentile_cont(0.5)` in both views and `area_stats()` | Complete | `0007_stats_recency.sql` |
| Minimum sample size | n ≥ 3 | `having count(*) >= 3` in all three; UI copy says so | Complete, verified live (`public_stats_city` returned one n=3 bucket; locality view empty) | live curl; screenshot `prod-390-stats` |
| Recency | 18 months | In 0007 (applied live: NOT VERIFIED, indistinguishable with 13-day-old data) | Complete (code) | `0007` |
| Area stats | Current viewport | `area_stats` RPC, aborts stale requests, cached per bounds | Complete | `src/ui/stats.ts:48-73` |
| Empty states | Honest message | "Not enough rents … A group needs at least 3 rents from the last 18 months." | Complete | screenshot |
| Demo isolation | Stats must not mix demo + real | Explicit message in demo mode | Complete | `src/ui/stats.ts:133-139` |
| Privacy of small buckets | n ≥ 3 | Enforced; individual pins are public anyway | Complete | — |

---

## 3. Critical missing functionality

1. **Launch data bar not met.** 6 pins across 3 localities at the time of audit (two were added during the audit window on 12 Nov); SPEC §17 requires 150+ pins across 15+ localities before any public post. Phase 2b (survey import script, `scripts/import-survey.ts`) — the planned way to get there with consent — is **not built**.
2. **Security fixes are not deployed.** Working tree contains migration 0008, hardened functions, enforced CSP, contact-info filter and MapLibre 6; live site has none of it. Live `curl -I` shows no `Content-Security-Policy` and no `X-Frame-Options`.
3. **Privacy page has no contact channel** (`privacy.html:81` is a `TODO`). Deletion requests from people who cleared their browser cannot be made. DPDP review is a [HUMAN] launch item.
4. **No search-engine surface.** No `robots.txt` (live 404), no `sitemap.xml` (live 404), no canonical, no `og:image`, no `<h1>` on the map page, no locality pages (Phase 4 by NEXT-PHASES, but organic discovery is the stated growth channel).
5. **No ops safety net.** No `.github/workflows` (SPEC §14: weekly backup, keep-alive, nightly rebuild). Free-tier Supabase projects pause after inactivity and have no backups.

---

## 4. Security findings

Live checks were read-only. The repo's own gate script (`npm run security-check`) includes write-attempt probes; it was not run from this session (policy), so run it yourself after deploying.

| ID | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| S-1 | **High (live)** | Live site serves no CSP and no frame protection; `/admin.html` is framable (clickjacking of Approve/Remove). The fix exists only in the uncommitted `netlify.toml`. | live headers: only `nosniff`, `referrer-policy`, `permissions-policy`, HSTS | Fixed in tree, **not deployed** |
| S-2 | **High (live)** | Report de-duplication on the live DB is per client-chosen `browserId` only; 3 Turnstile solves hide any pin until an admin reviews. Live `tolet-maintenance` (if it is the HEAD version) also **deletes** boards at 3 "gone" reports. | `report-pin/index.ts` (HEAD vs tree), `0008_report_abuse.sql` | Fixed in tree + 0008, **not deployed** |
| S-3 | Medium | Rate-limit keys derive from `x-forwarded-for` first entry on HEAD (spoofable if the platform preserves client-supplied XFF). Tree prefers `cf-connecting-ip` / `x-real-ip` and supports `CLIENT_IP_HEADER`, but which header the platform guarantees is unknown. If every request resolves to `unknown`, **all users share one IP bucket** and the 5/day limit locks everyone out (`hit_rate_limit` is still called with `sha256('unknown'+salt)`). | `_shared/crypto.ts:16-21`, `_shared/ratelimit.ts:15` | NOT VERIFIED — run `scripts/check-client-ip.sh` live, then delete `ip-check` |
| S-4 | Medium | Public free text (`one_liner`, `society_name`, notes) accepts phone numbers/emails on the live functions. | `_shared/rules.ts` filter is uncommitted | Fixed in tree, **not deployed** |
| S-5 | Medium | Deploy-order hazard: the tree's `report-pin` / `report-tolet` insert `ip_hash`; if the functions are redeployed before 0008 is applied they 500 on every report. | `report-pin/index.ts:53` | Process risk |
| S-6 | Low | Turnstile `action` ("submit") is not checked server-side; hostname check is in tree only. | `src/ui/turnstile.ts:60`, `_shared/turnstile.ts` | Partial |
| S-7 | Low | `edit-pin` lets the token holder keep editing a pin that is `hidden` (auto-hidden by reports); the edit is accepted and the pin stays hidden. Acceptable, but an attacker who holds the token could churn content under review. | `edit-pin/index.ts:48-50` | Design note |
| S-8 | Low | Report `message` is stored raw apart from control-char stripping; it is admin-only and HTML-escaped in `admin.ts`. Fine. XSS review of all `innerHTML` sites: every user string passes `escapeHtml` (`pin-card.ts`, `list-view.ts`, `stats.ts`, `admin.ts`). | — | PASS |
| S-9 | Info | Secrets: `.env` never committed (`git log --all -- .env` empty); no JWT-shaped strings in any commit; `dist/` contains only the publishable key, site key and project URL; the one `sb_secret_` match in `dist/assets/admin-*.js` is supabase-js's own prefix check. | grep output | PASS |
| S-10 | Info | RLS/grants as written: every table RLS-on with no policies; default privileges revoked; anon gets 5 views + `area_stats`. Live anon GETs on `pins`, `pin_contacts`, `reports`, `tolet_reports`, `tolet_boards`, `moderation_log`, `rate_limits`, `admins`, `seekers`, `seeker_contacts` → `42501 permission denied`. Private bucket list → `[]`. | live curl | PASS (reads). Write probes NOT VERIFIED here |
| S-11 | Info | `public_pins` live columns contain `source`, `location_approx`, all 0003 columns, and **no** `import_ref`, `edit_token_hash`, `status`, `report_count`. | live JSON keys | PASS |
| S-12 | Info | CORS allow-list works live: preflight returns `Access-Control-Allow-Origin: https://guwahati-rent.netlify.app` for 8 deployed functions; `ip-check`, `send-digests`, `unsubscribe` are 404 (not deployed, correct). | live OPTIONS | PASS |
| S-13 | Info | Admin auth: `admin-review` verifies the user JWT via `auth.getUser` and the `admins` table; `verify_jwt=false` at the gateway is therefore safe. `tolet-maintenance` uses constant-time `CRON_SECRET` compare. | `admin-review/index.ts:40-53` | PASS |
| S-14 | Info | Dependencies: `npm audit` = 7 moderate, all in `typescript-eslint → minimatch` (lint only). `maplibre-gl` 6.16 (6.18 available), `vite` 6.4.5, `supabase-js` 2.117. `zod` and `browser-image-compression` removed from the frontend. | `npm audit`, lockfile | PASS |
| S-15 | Info | localStorage holds edit tokens by design; only XSS could exfiltrate; CSP (once deployed) hardens. `Permissions-Policy` allows camera/geolocation to self only. | — | PASS |
| S-16 | Info | `0002_cron.sql` schedules `send-digests` (function does not exist → daily 404) and `run_matching` (no seekers). Harmless noise; whether 0002 is applied at all is NOT VERIFIED. | `0002_cron.sql` | Note |

---

## 5. Performance findings

Measurements are from headless Chrome 157 with SwiftShader software GL on an M-series Mac. Absolute numbers are **not** phone numbers; long-task durations are inflated by software rendering. Relative behaviour across densities is what matters.

### Bundle (production build, gzip)

| Asset | Raw | Gzip | Note |
|---|---|---|---|
| `main-*.js` + `api-*.js` (map page, excl. MapLibre) | 57.7 KB | **22.0 KB** | Under the 60 KB budget (SPEC §8.8) |
| `map-*.js` (MapLibre + pmtiles + basemaps + app map code) | 1,163 KB | 316 KB | Lazy chunk |
| `maplibre-gl-worker-*.mjs` | 519 KB | 148 KB | Second large download; served as `text/javascript` via `netlify.toml` |
| `main-*.css` / `map-*.css` | 27.6 / 71.5 KB | 6.6 / 10.2 KB | |
| `datepicker-*.js` (flatpickr) | 51 KB | 15 KB | Loaded only when the form opens |
| `admin-*.js` (supabase-js) | 235 KB | 61 KB | Admin page only |
| `guwahati.pmtiles` | 3.2 MB | — | Range requests (206 verified live); first view fetches a few hundred KB |

Total decoded bytes on a cold map-page load: ~2.3 MB (desktop 2.36 MB). Over a 4G connection the ~465 KB gz of MapLibre + worker dominates; this is inherent to the chosen renderer and already deferred past first paint.

### Load and density (demo scenarios, dev server, 390×844 unless stated)

| Scenario | Pins | Pins ready | Longest task | Heap after load | Heap after interactions | Clusters rendered at z12 |
|---|---|---|---|---|---|---|
| normal | 25 | 1.15 s (cold) | 552 ms | 17 MB | 19 MB | 2 |
| dense | 80 | 0.82 s | 319 ms | 19 MB | 21 MB | 8 |
| stress | 260 | 0.83 s | 373 ms | 20 MB | 22 MB | 13 |
| crowded | 1,000 | 0.85 s | 387 ms | 22 MB | 22 MB | 21 |
| packed | 5,000 | 0.74 s | 393 ms | 24 MB | 28 MB | 27 |
| **max** | **20,000** | 0.70 s | 347 ms | 25 MB | **39 MB** | 26 |
| full | 500 | 0.88 s | 359 ms | 20 MB | 26 MB | 19 |
| max @1440×900 | 20,000 | 0.55 s | 137 ms | 28 MB | 51 MB | 65 |

The longest task at every density is MapLibre style/worker boot, not pin processing; 20k pins add ~10 MB of heap and no measurable load-time cost. **Verdict: the "load everything once" design holds comfortably to the spec's 20k ceiling.**

### Interaction cost (main-thread ms, 20k pins)

| Action | 390 | 1440 |
|---|---|---|
| Toggle BHK filter (re-filter + `setData` + list) | 2.8 | 4.1 |
| Type a min-rent value | 1.3 | 1.7 |
| Switch to List (sort 20k, render 100 rows) | 8.9 | 10.9 |
| Sort by rent | 9.3 | 10.6 |
| "Show 100 more" | 8.6 | 10.2 |
| Toggle monsoon heatmap | 0.9 | 2.4 |
| Open pin card (fetch + render) | ~700 ms (dominated by the 700 ms wait in the probe; render itself is sub-frame) | |

All interactions are well under one frame. The memo-isation in `filters.ts` (`createdMs` WeakMap) and `map.ts` (feature cache, `same()` short-circuit) is effective.

### Issues worth fixing

- **P-1 Preload the worker.** The MapLibre worker (148 KB gz) is discovered only after `map-*.js` executes. A `<link rel="modulepreload">` for both the map chunk and worker after first paint would shave one RTT off map-ready on 4G. Evidence: `dist/index.html` preloads only `api-*.js`.
- **P-2 `fetchPinDetails` per card open** is one extra round trip per tap; fine now, but with 1,000+ pins a `select=*` on first load is only ~1 MB and would remove it. Decide once real volume is known.
- **P-3 Listener growth.** `JSEventListeners` rose from ~220 to 611 (full@390) after opening dialogs and list rows; the list rebuilds row buttons with fresh listeners on every render (`list-view.ts:93`). Not a leak (old rows are GC'd with their listeners) but one delegated handler on `#list-body` is simpler.
- **P-4 Lighthouse not run** (sandbox refused the download). Acceptance criteria "Performance ≥ 80, Accessibility ≥ 95" remain NOT VERIFIED; run it on the Netlify URL from a real phone profile.

---

## 6. UI/UX findings

Visual QA was performed on the rendered production build at all six requested viewports and in every dialog state (screenshots retained in the session scratchpad). The design system in `src/styles/main.css:1-19` (8/12/14 px radii, one control height, system fonts, teal/orange/amber palette, one floating-panel surface) is applied consistently; there are no pill buttons (`999px` does not appear in the CSS), no nested cards, and the basemap is the untinted Protomaps `light` flavour. Overall the interface reads as a calm, mature consumer product.

| ID | Area | Finding | Evidence |
|---|---|---|---|
| U-1 | Touch targets | MapLibre zoom/geolocate buttons measure **29×29 px** on every touch viewport, although `main.css:768-772` sets them to 44 px under `(pointer: coarse)`. MapLibre 6's own stylesheet (loaded later in the lazy chunk) wins. Spec requires ≥ 44 px. | audit-prod `small[]` |
| U-2 | Touch targets | Map/List and toolbar `.tool` buttons are **40 px** tall on touch (`--h-tool: 44px` is overridden to 40 by the toolbar's 4 px padding math); top-bar `btn-sm` is 36 px on mouse (fine) but the toolbar should hit 44 on touch per its own comment. | audit-prod `small[]` (btn-view-map 45×40) |
| U-3 | Keyboard | Pin-card body (`#pin-body`) scrolls but is not focusable: keyboard users cannot scroll long cards. Stats body already has `tabindex="0"`; pin body does not. axe: `scrollable-region-focusable` (serious). | axe results; `index.html:824` |
| U-4 | Contrast | axe flagged 16 `color-contrast` nodes inside the rent form (`#64929d` / `#f6f8f9`). These colours do not exist in the stylesheet; the values are the dialog's `::backdrop` blended with the teal chips, i.e. an axe measurement artefact with an open modal. Manual token check: white on teal 8.4:1, ink on white 15:1, muted 5.65:1, orange button 4.63:1 (AA). **One real marginal:** link colour `--teal-2 #087f98` on page background `#f8fafc` is **4.46:1**, just under AA 4.5 (static pages use `--teal` at 8.4:1, so only in-app links on tinted surfaces are affected). | contrast table; axe |
| U-5 | Mobile toolbar | At 375 px the Filters and Stats icons are dropped and the toolbar runs edge to edge; it works, but the "Monsoon" label truncates its differentiator ("waterlogging" is sr-only). Acceptable. | screenshot `prod-375x812` |
| U-6 | Map legend | On phones the "N rents pinned" count is hidden (`legend-count` display:none under 640 px) and only appears in the list caption. First-time phone users get no sense of data volume. | `main.css:654-658` |
| U-7 | First visit | Welcome sheet covers the lower half of the map at 390; the map is visible behind it, which is good. Button copy "Show me the map" is clear. | screenshot |
| U-8 | Form length | The rent form is long (home, rent, water, monsoon, electricity, more). Required fields are only the first two sections and the copy says so; conditional groups collapse. Consider a progress cue or "Add my rent" sticky state once rent is valid. | screenshots |
| U-9 | Empty states | "Not enough rents … at least 3 rents from the last 18 months" (stats), "No rents match…" (list) are present and honest. The **map itself** has no empty state when 0 pins match a filter other than the badge count. | — |
| U-10 | Admin page | Title and `<h1>` say "Review To-Let boards" although the page also reviews reported pins and "gone" boards. | `admin.html:7,15` |
| U-11 | Static pages | About says To-Let boards are "Coming next" although the feature is live. Privacy "Contact" section is a TODO. | `about.html:30-33`, `privacy.html:81-84` |
| U-12 | Focus management | Dialogs move focus to the heading on open and return it to the trigger on close; Escape closes; backdrop click closes only when the press started on the backdrop. Verified in code. | `src/ui/dialog.ts` |
| U-13 | Reduced motion | `prefers-reduced-motion` respected for fly-to and sheet animation. | `src/map.ts:30,292`, `main.css:960` |
| U-14 | Screen reader | Map region has a descriptive label; toasts and statuses are `aria-live`; list rows have per-row labels; chips carry meaning in text. axe found 0 violations on the map, filters, stats, list, To-Let dialog and all static pages. | axe results |
| U-15 | Inline styles | 13 `style="--cols: n"` attributes force `'unsafe-inline'` for styles in the CSP. Moving them to classes (`.cols-2 … .cols-5`) would allow dropping it. | `index.html`, `netlify.toml` |

---

## 7. SEO findings

| ID | Finding | Evidence |
|---|---|---|
| SEO-1 | `robots.txt` and `sitemap.xml` are absent from `public/` and return 404 live. | `ls public/`; live curl |
| SEO-2 | No `<link rel="canonical">` on any page. Netlify serves the same content on the `*.netlify.app` host and any future custom domain → duplicate content once a domain is attached. | grep across `*.html` |
| SEO-3 | No `og:image` / `twitter:card`; WhatsApp previews (the primary sharing channel) show no image. `og:url` also missing. | `index.html:12-17` |
| SEO-4 | The map page has **no `<h1>`**; the brand is an `<a>` and the tagline a `<p>`. Static pages have proper `<h1>`/`<h2>` hierarchy. | `grep -c "<h1" index.html` = 0 |
| SEO-5 | Static pages (about, privacy, terms) have titles but **no meta description**. | audit-prod `pages` |
| SEO-6 | No locality pages, no `/rent-in-guwahati/` style landing pages, no sitemap (SPEC §12 / Phase 4). These are the stated organic-growth engine and need `public_stats_locality` rows (n ≥ 3 per BHK, ≥ 5 pins per locality) — so they are gated on data, not code. | SPEC §12 |
| SEO-7 | The map page content is JS-rendered; crawlers see the shell, dialogs' static copy and `<noscript>`. Fine for a tool page; the informational pages should carry the indexable copy. | `dist/index.html` |
| SEO-8 | `unsubscribe.html` is a styled-less placeholder that ships to production and is crawlable (no `noindex`). | `unsubscribe.html` |
| SEO-9 | Structured data: none. A `WebSite` + `Organization` JSON-LD on the home page and `Dataset`/`Place`-style data on future locality pages would help; low priority. | — |

---

## 8. Deployment gaps

| ID | Item | State | Evidence |
|---|---|---|---|
| D-1 | Uncommitted security release | 19 modified + 6 untracked files (0008, hardened functions, CSP, MapLibre 6, admin gone-queue, image check, contact filter, tests) sit only on this machine | `git status` |
| D-2 | Live headers | No CSP / X-Frame-Options live; HSTS present (Netlify default, with `includeSubDomains; preload`) | live `curl -I` |
| D-3 | Migrations | Live: 0001–0006 confirmed; 0007 likely (applied by the same `db push`) but NOT VERIFIED; 0008 not applied (file is untracked) | live view columns; `moderation_log` exists |
| D-4 | Edge Function versions | 8 functions deployed; whether each is the HEAD or tree version is NOT VERIFIED | live OPTIONS |
| D-5 | Secrets | `TURNSTILE_SECRET_KEY`, `HASH_SALT`, `ALLOWED_ORIGINS`, `CRON_SECRET`, Vault `project_url`/`cron_secret` — NOT VERIFIED. If `HASH_SALT` were unset every function would 500 (`saltedHash` throws); since the live site accepted pins today, at least `submit-pin`'s secrets are set. | `_shared/crypto.ts:36-40` |
| D-6 | Cron | 0002 (`flag-outliers`, `cleanup`, `run-matching`, `send-digests`) and 0005 (`tolet-maintenance`) — whether pg_cron/pg_net are enabled and jobs run is NOT VERIFIED. If `cleanup()` never runs, `rate_limits` grows forever and report messages are never purged. | migrations |
| D-7 | Domain / HTTPS | `*.netlify.app` only; HTTPS on. Custom `.in` domain (SPEC Appendix A) not configured; CSP pins the Supabase host so a domain change needs `ALLOWED_ORIGINS` + Turnstile widget domains updated. | `netlify.toml`, NEXT-PHASES §1 |
| D-8 | Error monitoring | None. `console.error` in functions only; no Sentry/log drain. | — |
| D-9 | Analytics | None (SPEC: Cloudflare Web Analytics or Umami, cookie-free). | — |
| D-10 | Backups | None. Free tier has no PITR; SPEC §14.1 workflow not created. | no `.github/` |
| D-11 | Keep-alive / nightly rebuild | None. Project will pause after ~7 idle days. | no `.github/` |
| D-12 | Rollback | Netlify deploy history gives frontend rollback; **database migrations have no down scripts**, and functions must be redeployed from git. No documented rollback runbook. | — |
| D-13 | Prod vs dev | Demo mode is behind `import.meta.env.DEV` and verified absent from `dist/` (0 matches for `demoPins`/`__grMap`); Turnstile test key only under DEV. | grep dist |
| D-14 | Temporary function | `ip-check` is in `config.toml` but not deployed (404 live) — correct; must be removed from `config.toml` after the M-2 check. | `supabase/config.toml:35` |
| D-15 | Node version | `netlify.toml` pins Node 22; local is 24; no `engines`/`.nvmrc`. Fine, but add `engines` to catch drift. | `package.json` |
| D-16 | Build output hygiene | No source maps; `.DS_Store` files exist locally (`./.DS_Store`, `src/.DS_Store`, `supabase/.DS_Store`) — gitignored, but `vite build` copies only `public/`, so they are not in `dist/` (verified). | `ls dist` |

---

## 9. Technical debt

**Architecture verdict.** The vanilla-TS structure is sound and should be kept: `api.ts` is the single network layer; `rules.ts` is a dependency-free module shared verbatim by browser and Deno; UI modules are factory functions over existing DOM; state is a small URL-backed object. No framework is warranted.

| ID | Debt | Why it matters | Evidence |
|---|---|---|---|
| T-1 | **Docs are stale / contradictory.** README and CLAUDE.md: "Phase 2 … not yet deployed" — the live site serves the Phase 2 UI and 0006 is applied. PROJECT_CONTEXT.md: MapLibre 5, admin page "placeholder (Phase 4)", To-Let "Phase 4", `zod`/`browser-image-compression` as allowed deps, pill buttons/999px radii. SPEC §1b vs NEXT-PHASES: listing lifetime 45 vs 60 days. SPEC §8.7 says parking and society name are required; the form makes them optional. SPEC §8.3 asks for a cluster **average** label while §5.10 says medians only. | New contributors (human or AI) will act on wrong state | files cited |
| T-2 | Locality list duplicated (`public/localities.json` and `_shared/localities.ts`) with no test asserting equality; the two `nearestLocality` implementations use different distance formulas (haversine vs equirectangular). | Silent drift changes which locality a pin gets | `src/localities.ts:22-30`, `_shared/geo.ts:9-19` |
| T-3 | `supabase/functions` are excluded from ESLint; `vite.config.ts` excluded from `tsc`. | Lint gaps in the security-critical code | `eslint.config.js`, `tsconfig.json` |
| T-4 | `SECURITY_AUDIT_REPORT.md` is untracked, says "don't commit this file" while findings are live, and the fixes it describes are also uncommitted — the two must move together. | Risk of losing the fix set or publishing an exploit map early | `git status` |
| T-5 | `0002_cron.sql` schedules Phase 3 jobs (`send-digests`, `run-matching`) that cannot succeed yet. | Daily noise in cron logs; confusing when debugging | `0002_cron.sql` |
| T-6 | Each Edge Function repeats the same 8-line "parse → failedFields → warn → 400" preamble; `report-tolet`, `submit-tolet`, `tolet-upload-url`, `admin-review` re-implement `failedFields` inline. | Small, but one helper in `http.ts` removes four copies | function files |
| T-7 | `rent-pin.ts` is 555 lines mixing collection, validation, error display, double-check, edit pre-fill and datepicker loading. Still readable, but it is the file most likely to regress. | Maintainability | `src/forms/rent-pin.ts` |
| T-8 | Hidden-pin edit path (`edit-pin` returns `pin: null` when the view hides it; client falls back to a local merge) is an implicit contract. | Subtle UI inconsistency after an edit of an auto-hidden pin | `edit-pin/index.ts:70-72`, `rent-pin.ts:382` |
| T-9 | `unsubscribe.html` placeholder ships in production. | Dead page | `vite.config.ts` |
| T-10 | No `engines` field, no `CHANGELOG`, version `0.0.0`. | Release hygiene | `package.json` |
| T-11 | 13 inline `style="--cols"` attributes keep `'unsafe-inline'` in the CSP style-src. | Weakens CSP slightly | `index.html` |

---

## 10. Missing tests

Existing: 32 unit tests (`node --test` via `tsx`) covering shared rules, contact-info filter, image-byte inspection, filters URL round-trip, double-check, demo dataset validity and two migration-text invariants. Typecheck, lint, build and `deno check` pass. README describes a Phase 1 test run against local Postgres/PostgREST/Deno, but **none of that harness is in the repo**.

| Area | Gap |
|---|---|
| Edge Functions | Zero automated tests. `submit-pin` (bands, bbox, rounding, locality, token hash), `edit-pin` (wrong token, archived pin, hidden pin, update path), `report-pin` (dedupe by browser **and** IP, auto-hide at 3, 404 on inactive pin), `submit-tolet` (ownership, 30-min window, size/MIME/byte checks), `admin-review` (403 for non-admin, every action + log row), `tolet-maintenance` (does not delete gone-reported boards). Deno has a built-in test runner; functions can be unit-tested by extracting handlers, or integration-tested against `supabase start`. |
| Database | No migration test. Needed: fresh apply of 0001→0008 on Postgres 16 + PostGIS; security gate assertions (anon cannot read/write; views expose exact column sets; `public_pins` column order invariant for 0003→0004 is tested, 0006/0007 are not); trigger `bump_report_count` concurrency; `cleanup()` effects. |
| Security boundaries | `scripts/security-check.sh` exists but is manual. Should run in CI against a local stack on every migration change, and be extended for the 2a/Phase 2 checks it says it includes (verify the script actually covers `tolet_reports`, `moderation_log`, report `message`). |
| Browser / E2E | None. Priority flows: place → submit (with Turnstile test key) → pin appears → refresh → delete; edit; report; filters change map and list and URL; Map/List; welcome consent; To-Let dialog with a fixture image (preview, remove, compress sizes, EXIF absence); keyboard-only traversal of list and dialogs; mobile viewport layout. Playwright is the natural fit (would be a new dev dependency; needs approval per SPEC §0.4). |
| Image pipeline | `image.ts` compression is untested in automation (sizes ≤ 400 KB / ≤ 60 KB, JPEG fallback). |
| Form validation | Client-side `validate()` in `rent-pin.ts` (deposit-in-rupees heuristic, badInput handling) is untested. |
| Rate limits | No test of `hit_rate_limit` windows or that both IP and browser counters gate. |
| Empty / error states | No tests for read-only mode (`BACKEND_READY=false`), failed pin fetch toast, pre-0004 `public_tolet` tolerance. |
| Localities | No test that `public/localities.json` equals `_shared/localities.ts`. |

---

## 11. Prioritised implementation roadmap

### P0 — Critical

**P0-1 Ship the security release (commit, migrate, deploy in the right order).**
- Why: S-1, S-2, S-4 are live today; the fixes exist and are tested.
- Dependencies: owner decision to release Phase 2 fully (0008 depends on 0006, already live).
- Files: everything in `git status` (0008, `_shared/*`, `report-*`, `submit-tolet`, `tolet-maintenance`, `admin-review`, `admin.html`, `src/pages/admin.ts`, `src/forms/rent-pin.ts`, `netlify.toml`, `package.json`, lockfile).
- Order: `supabase db push` (0007 if pending, 0008) → deploy all functions `--no-verify-jwt` → commit + push (Netlify) → `npm run security-check`.
- Acceptance: live `curl -I` shows the CSP and `X-Frame-Options: DENY`; browser console shows 0 CSP violations on `/` and `/admin.html`; a pin with a phone number in the one-liner is refused; the security-check script prints all PASS.
- Test: run the gate; open the live site on a phone; submit one real pin.

**P0-2 Verify and pin the client-IP header.**
- Why: S-3; until confirmed, rate limits may be spoofable or (worse) shared.
- Dependencies: P0-1 deploys `ip-check`.
- Files: `scripts/check-client-ip.sh`, `supabase/functions/ip-check/`, `config.toml`.
- Acceptance: script reports the chosen header cannot be forged; `CLIENT_IP_HEADER` set if needed; `ip-check` deleted from Supabase, the repo and `config.toml`.
- Test: forged-header run before/after; confirm two devices on different networks each get their own 5/day quota.

**P0-3 Confirm live schema, secrets and cron.**
- Why: D-3, D-5, D-6 are unknowns that decide whether reports, boards and cleanup work.
- Files: none (dashboard/SQL).
- Acceptance: `select * from supabase_migrations.schema_migrations` lists 0001–0008; `cron.job` lists `flag-outliers`, `cleanup`, `tolet-maintenance` with recent successful `cron.job_run_details`; Vault has `project_url` and `cron_secret`; function secrets listed.
- Test: trigger `tolet-maintenance` manually with the secret; confirm a `200 {deleted, files, failed}`.

**P0-4 Add the privacy contact channel and fix launch copy.**
- Why: Legal/ethical blocker for a site that stores user data (DPDP).
- Files: `privacy.html:81`, `about.html:30` ("Coming next" is stale), `terms.html`.
- Acceptance: a working email on the privacy page; copy reflects live features; [HUMAN] legal review ticked.
- Test: manual read-through; link check.

### P1 — Required before public launch

**P1-1 Phase 2b survey import** (`scripts/import-survey.ts`, Google Form) exactly per NEXT-PHASES §3, plus the pin-card "Approximate location" / "Shared via survey" labels.
- Why: only consented route to the 150-pin bar.
- Dependencies: Google Form [HUMAN]; service-role key at run time only.
- Files: `scripts/import-survey.ts` (new), `src/ui/pin-card.ts`, `src/types.ts`, `tests/import-survey.test.ts` (new, CSV parser + mapping + jitter determinism + idempotency).
- Acceptance: NEXT-PHASES §3.5 checklist; `git grep` shows no key.

**P1-2 Ops workflows**: `.github/workflows/backup.yml`, `keepalive.yml`, `nightly-rebuild.yml` per SPEC §14, with GitHub secrets.
- Acceptance: one successful run of each; a backup artefact exists; a build-hook deploy appears in Netlify.

**P1-3 SEO baseline**: `public/robots.txt`, `public/sitemap.xml` (static pages for now), canonical on every page, `og:image` + `og:url` + `twitter:card`, `<h1>` on the map page (visually the brand, or sr-only), meta descriptions on about/privacy/terms, `noindex` or removal of `unsubscribe.html`.
- Files: `index.html`, `about.html`, `privacy.html`, `terms.html`, `public/`, `vite.config.ts`.
- Acceptance: all pages pass a basic SEO lint; WhatsApp preview shows an image.

**P1-4 Touch-target and keyboard fixes** (U-1, U-2, U-3).
- Files: `src/styles/main.css` (raise specificity for `.maplibregl-ctrl-group button` on coarse pointers; toolbar height), `index.html:824` (`tabindex="0"` + `role="region"` on `#pin-body`).
- Acceptance: audit script reports no interactive element under 44 px on touch viewports; axe 0 serious violations in every state.

**P1-5 Edge Function and migration tests in CI.**
- Files: `supabase/functions/**/*_test.ts` (new), a GitHub Actions job using `supabase start` + `scripts/security-check.sh`; `tests/localities-sync.test.ts`.
- Acceptance: CI fails if anon can read a private column, if a function skips Turnstile/rate-limit, or if the two locality lists differ.

**P1-6 Error monitoring + analytics** (Sentry free tier or Supabase log drain; Cloudflare Web Analytics or Umami).
- Acceptance: a thrown error in `submit-pin` is visible outside the Supabase logs within a minute; page views counted without cookies.

**P1-7 Documentation sync**: README status, CLAUDE.md, PROJECT_CONTEXT.md (or delete it in favour of README), a `DEPLOY.md` runbook with rollback steps (Netlify rollback; function redeploy from tag; migration forward-fix policy).

**P1-8 Custom domain + Resend prep** [HUMAN]: buy domain, DNS on Cloudflare, add to Turnstile widget, `ALLOWED_ORIGINS`, CSP `connect-src` unchanged (Supabase host), Netlify primary domain + redirect from `*.netlify.app`.

### P2 — Important improvements

- **P2-1** Preload map chunk + worker after first paint (P-1).
- **P2-2** Replace inline `style="--cols"` with classes and drop `'unsafe-inline'` (U-15/T-11).
- **P2-3** Link colour on tinted surfaces to ≥ 4.5:1 (U-4); show pin count on phones (U-6); map empty state for zero-match filters (U-9); admin page title (U-10).
- **P2-4** `pct_waterlog_severe` denominator = reported pins, or rename the column label.
- **P2-5** Playwright E2E suite for the flows in §10 (new dev dependency; ask first).
- **P2-6** Consolidate the function preamble helper (T-6); include `supabase/functions` in ESLint with a Deno-aware config (T-3).
- **P2-7** Unschedule Phase 3 cron jobs until Phase 3 (T-5).
- **P2-8** Locality pages + sitemap generator (SPEC §12) once ≥ 5 pins/locality exist; gate generation on data.
- **P2-9** Rename/relabel the cluster `~₹` average or compute a median in the client from the cluster's leaves (SPEC §5.10 tension).

### P3 — Future enhancements

- Phase 3 (listings, seekers, matching, digests, POST-only unsubscribe) — needs domain + Resend.
- Water-storage field, locality filter, per-pin OG share pages, draw-a-rectangle stats, R2 for `tolet-public` if egress nears 5 GB/month.
- Dark mode (the design system is light-only by decision).

---

## 12. Production launch checklist

**Code and deploy**
- [ ] Working-tree security release committed and pushed (P0-1)
- [ ] `supabase db push` applied through 0008; `schema_migrations` confirms
- [ ] All 8 functions redeployed `--no-verify-jwt`; `ip-check` deleted everywhere after the header check (P0-2)
- [ ] `npm run security-check` all PASS against production (with and then without the test rows)
- [ ] Live headers: CSP enforced, `X-Frame-Options: DENY`, HSTS; 0 CSP console errors on `/` and `/admin.html`
- [ ] `ALLOWED_ORIGINS` contains every origin; Turnstile widget domains match
- [ ] Netlify env vars: only `VITE_*`; none marked secret
- [ ] `grep -rE "service_role|sb_secret_" dist/` yields only the supabase-js prefix check; no source maps

**Data and legal**
- [ ] Privacy page has a contact email; privacy/terms reviewed for DPDP [HUMAN]
- [ ] Locality centres verified on the map [HUMAN]; both locality files identical
- [ ] 150+ real pins across 15+ localities (survey import P1-1) before any public post
- [ ] Admin user inserted into `admins`; magic-link redirect URLs configured; one real board approved and one rejected end to end

**Ops**
- [ ] Backup, keep-alive and nightly-rebuild workflows green
- [ ] pg_cron jobs running (`cleanup`, `flag-outliers`, `tolet-maintenance`)
- [ ] Error monitoring receiving events; analytics counting
- [ ] Rollback runbook written and tried once (Netlify rollback + function redeploy)

**Quality**
- [ ] Lighthouse mobile on the live URL: Performance ≥ 80, Accessibility ≥ 95 (NOT VERIFIED in this audit)
- [ ] Tested on a budget Android over 4G: map, pin, edit, delete, report, To-Let upload
- [ ] Touch targets ≥ 44 px on all map controls; pin card keyboard-scrollable
- [ ] robots.txt, sitemap.xml, canonical, OG image live; WhatsApp preview checked
- [ ] README/CLAUDE.md/PROJECT_CONTEXT.md reflect the deployed state

---

### Appendix — commands run and results

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS, 32/32 |
| `npm run build` | PASS (sizes in §5) |
| `npm audit` | 7 moderate (lint tooling only) |
| `deno check` × 9 functions | PASS (Deno 2.9.8) |
| `git log --all -- .env` | empty |
| Live `curl -I https://guwahati-rent.netlify.app/` | no CSP, no XFO |
| Live `/robots.txt`, `/sitemap.xml` | 404, 404 |
| Live anon GET on 10 private tables | all `42501` |
| Live `public_pins` count | 4 at 10:34 UTC, 6 at 10:44 UTC |
| Live function preflights | 8 × 200 with allow-list origin; `ip-check`/`send-digests`/`unsubscribe` 404 |
| Headless Chrome: 6 viewports × map, + 20 dialog/page states | screenshots captured; 0 console errors except Turnstile 110200 (expected on 127.0.0.1) |
| axe-core 4.10 on 13 states | 2 violation types: `scrollable-region-focusable` (#pin-body), `color-contrast` (backdrop artefact; one real 4.46:1 link case found manually) |
| Lighthouse | NOT RUN (sandbox refused package execution) |
