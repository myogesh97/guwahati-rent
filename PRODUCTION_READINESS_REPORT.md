# Guwahati Rent: Production Readiness Report

**Date:** 12 Nov 2026 · **Baseline:** `b8181bd` on `main` (= `origin/main`, tag `v0.3.0` → `91fde5d` live) · **This work:** on top of `b8181bd`. Deployed 12 Nov: migration 0009 and all 8 functions (submit-pin v13 etc.). Frontend: pending push (`v0.4.0`).
**Companion files:** [PRODUCTION_TEST_RESULTS.md](PRODUCTION_TEST_RESULTS.md) (every command and result) · [NETLIFY_DEPLOYMENT_CHECKLIST.md](NETLIFY_DEPLOYMENT_CHECKLIST.md) (how to ship it) · [CHANGELOG.md](CHANGELOG.md) (what changed).

## Decision

### **B. READY AFTER EXTERNAL CONFIGURATION** (code), with a public launch still gated on real data

- **The code is ready to deploy.** Every local check passes: 40 Node, 14 Deno, 80 database and 207 browser checks, with 0 failures, on a fresh migration of the full schema and on the production build under the real CSP.
- **Not "A. Ready for production".** The things that still decide whether real users are safe can only be done outside this repository, and none of them has been done yet:
  - there is **no working database backup**;
  - the **write paths have not been exercised against production** since the 12 Nov function deploy;
  - the **client-IP header** behind rate limiting is unconfirmed;
  - the **nightly jobs** are unverified;
  - the **privacy page has no contact address** and there has been no DPDP review;
  - the **locality centres** are unverified.
- **Even after all of that,** SPEC §17 forbids any public post before **150+ real pins across 15+ localities**. There are **8 pins in 6 localities** today. That is a data-collection task, not a code task.

Until then, the site is appropriate for a quiet, invite-only beta.

---

## 1. Baseline: before any change (verified 12 Nov 2026)

| Question | Answer, with evidence |
|---|---|
| **What works** | Map (MapLibre 6 + self-hosted PMTiles), rent pins via one GeoJSON source, list view, filters with URL sync, stats (medians, n ≥ 3, 18 months), monsoon heatmap, edit/delete by token, reporting with auto-hide at 3, To-Let pipeline, admin moderation, dev-only demo mode. Migrations 0001–0008 applied (`supabase migration list`). 8 functions ACTIVE (`supabase functions list`). Live headers (CSP, XFO, HSTS). Anon reads limited to the public views (12 private tables → 401). |
| **Incomplete** | Survey importer built but never run. Share after submit links to the site root. No map empty state. The waterlogging share understates severity. Stale outlier flags are never cleared. No structured data. No DB, function-handler or browser tests. |
| **Broken** | `weekly-backup` failed on its only run. `scripts/check-client-ip.sh` needs a function that was deleted. The privacy page states board deletion behaviour that has been untrue since 0008. Cron calls the non-existent `send-digests` every day. |
| **Must happen before launch** | Backups; production smoke test and security gate; client-IP confirmation; cron/Vault check; privacy contact and DPDP review; locality centres; 150+ real pins; Lighthouse and a real phone. |
| **External configuration** | GitHub `SUPABASE_DB_URL`; Supabase SQL editor (cron, Vault, admin user, Auth redirects); `CLIENT_IP_HEADER` if needed; Netlify badge setting; contact email / domain; legal review; Google Form. |

## 2. What changed in this work

Full list in [CHANGELOG.md](CHANGELOG.md). Nothing has been pushed, deployed or run against production.

| # | Area | Change | Files |
|---|---|---|---|
| 1 | Security / availability | **An unknown client IP no longer shares one rate-limit bucket.** Before, when no proxy header arrived, every caller hashed the literal `"unknown"`, so one person's 5/day quota locked out everyone. Now only the browser counter applies, and a count-only warning is logged (never the IP). The key format for known IPs is unchanged, so existing counters stay valid. | `_shared/crypto.ts` (`rateLimitKeys`), `_shared/ratelimit.ts` |
| 2 | Security | **Turnstile `action` is checked server-side** (`submit`, the only action the site renders). Tokens from widgets with another action are refused. Empty actions (Cloudflare's test keys) still pass the hostname check. | `_shared/turnstile.ts`, `src/ui/turnstile.ts` (comment) |
| 3 | Privacy / legal copy | The privacy page now says boards reported gone are **hidden and reviewed**, not auto-deleted (true since 0008). It also discloses the salted **IP hash** kept with every report. Date updated. The contact address is still a placeholder (external). | `privacy.html` |
| 4 | Ops | The backup workflow now **diagnoses a bad `SUPABASE_DB_URL` without printing it**: direct IPv6-only host, Transaction pooler port, password placeholder, wrong scheme, unreachable host (`pg_isready`). Tested against 6 synthetic URLs. | `.github/workflows/backup.yml` |
| 5 | Ops / security | **The client-IP diagnostic works again.** A CRON_SECRET-protected function that returns booleans only (never IPs), kept **outside** `supabase/functions/` so a blanket deploy can't ship it. The script reports both failure modes (IP unknown; IP forgeable). Tested locally. The temporary copy location is gitignored. | `scripts/diagnostics/ip-check/index.ts`, `scripts/check-client-ip.sh`, `.gitignore` |
| 6 | Database | **Migration 0009** (prepared, not applied): unschedules the Phase 3 cron jobs (`send-digests` 404s daily; `run-matching` has nothing to match). `pct_waterlog_severe` now counts only rents that answered the monsoon question. `flag_outliers()` clears stale flags when a group drops below 5. Same columns, same grants. | `supabase/migrations/0009_launch_hygiene.sql`, `src/ui/stats.ts` (footnote) |
| 7 | Product | **Map empty state.** When filters hide every rent, a panel says so with **Clear filters**. It isn't shown when rents are switched off on purpose, or in list view (which has its own message). | `index.html`, `src/main.ts`, `src/styles/main.css` |
| 8 | SEO | A `WebSite` JSON-LD block. It describes the site only, never individual rents. It isn't executable, so the CSP allows it. | `index.html` |
| 9 | Tests | **Database integration test:** fresh Postgres + PostGIS with Supabase's roles and its permissive default grants, all migrations applied, then 80 checks. Includes a **negative control**: a deliberate leak migration makes it fail 3 checks. | `tests/db/run.sh`, `npm run test:db`, CI job `database` |
| 10 | Tests | **Browser smoke test** with no new dependencies (Node WebSocket + Chrome DevTools Protocol): 6 viewports on the production build with the real `netlify.toml` CSP injected, plus 7 demo modes. **Every Supabase write is blocked.** | `scripts/browser-smoke.mjs`, `npm run test:browser` |
| 11 | Tests | 6 new Deno tests: Turnstile verification against a stubbed siteverify (host, action, HTTP error, missing secret, IP forwarding), and rate-limit keys. | `_shared/turnstile_test.ts`, `_shared/shared_test.ts` |
| 12 | Docs | Status lines synced: CLAUDE.md, README.md, DEPLOY.md §0/§6, SECURITY_AUDIT_REPORT.md §11/12, PROJECT_CONTEXT.md. New test commands documented. | those files |

**Not changed on purpose:**
- MapLibre stays on **6.16**. The brief says MapLibre 5, but 5.x carried a critical advisory and the upgrade was already tested and deployed (`v0.3.0`). Downgrading would reintroduce it.
- The cluster `~₹` label is still an average. SPEC §8.3 asks for it while §5.10 says "medians only"; that's your decision (P2-3).
- No locality search or picker. SPEC doesn't require one; `?area=<slug>` exists.
- No Phase 3. NEXT-PHASES §5 defers it until about 300 pins.
- No new dependencies.

## 3. What is now working (verified locally)

| Area | Evidence |
|---|---|
| Schema, RLS, grants | `npm run test:db`: all 9 migrations apply to a fresh DB. anon and authenticated cannot read 12 private tables, cannot write, and cannot execute `run_matching`/`cleanup`/`flag_outliers`/`hit_rate_limit`. They can read the 5 views and call `area_stats`. RLS on everywhere, 0 policies. A table created *after* the migrations is still private. 0 base-table grants to anon. |
| Stats rules | Median (12000), not average (17333). n ≥ 3 in both views and `area_stats`. 18-month window (old rent off the stats, still on the map). Outliers excluded. 0009's waterlogging share = 50 % (1 of 2 answered). |
| Trust rules | 2 reports don't hide a pin; 3 from distinct browsers/IPs do (`hidden:3`). The same browser or the same IP can't report twice (0008). Report messages appear in no public view. `public_tolet` shows only approved, unexpired boards with < 3 gone reports. |
| Rate limit / cleanup / cron | `hit_rate_limit` true,true,false at limit 2. `cleanup()` prunes old rate-limit rows. After 0009 only `cleanup`, `flag-outliers` and `tolet-maintenance` remain scheduled. Bucket limits are 512 KB, webp/jpeg. |
| UI, 6 viewports (production build) | Map renders with real pins (8); welcome dialog; no horizontal scroll; floating controls don't overlap; touch targets ≥ 44 px (only the map's inline attribution links are smaller, a WCAG 2.5.8 exception); Map ↔ List; list row → pin card with focus in; Esc → focus back to the row; Filters writes `?bhk=2`; Stats shows medians; monsoon toggle + legend + `?water=1`; empty state + Clear filters; To-Let dialog opens with submit disabled until there's a photo; **0 CSP violations under the real policy**; 0 app console errors; 0 failed requests; 0 write attempts; `?demo=max` ignored in production. |
| Demo modes | normal 25, dense 80, stress 260, crowded 1,000, packed 5,000, max 20,000, full 500: banner shown, adding off, 0 DOM markers, 0 console errors. Filter change ≤ 6.9 ms and list paint ≤ 31.2 ms even at 20,000 pins. Heap 14–41 MB. |
| Security helpers | Turnstile host and action check, IP forwarding, no silent pass without a secret. Unknown IPs never share a rate-limit bucket. |

## 4. Remaining issues (same IDs as the 12 Nov audit)

**[H]** = needs you or a dashboard. Hours are engineering time.

| ID | Priority | Item | Status now | What is needed |
|---|---|---|---|---|
| P0-1 | P0 | DB backups | **DONE** (12 Nov): `weekly-backup` run #4 green; artifact restored into a throwaway DB with 12 tables, 5 views, 8 active pins and the same city median as live. | [H] Set `SUPABASE_DB_URL` to the **Session pooler** string (your project's pooler host is `aws-1-eu-central-1.pooler.supabase.com:5432`, user `postgres.<ref>`). Run `weekly-backup`. Restore once locally. |
| P0-2 | P0 | Production smoke test of every write path + full `npm run security-check` | **Open** | After deploying this release: the checklist in NETLIFY_DEPLOYMENT_CHECKLIST.md §7 on a real phone |
| P0-3 | P0 | Client-IP header confirmed | **DONE** (12 Nov): live probe PASS. The platform sets `cf-connecting-ip`; forged `X-Forwarded-For`/`X-Real-IP`/`CF-Connecting-IP` were not used. `ip-check` deleted. `CLIENT_IP_HEADER` not needed. | — |
| P0-4 | P0 | Cron jobs + Vault running | **Open** | [H] SQL editor: `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 20;` |
| P0-5 | P0 | Privacy contact + DPDP review | **Partly done** (copy corrected) | [H] Contact address in `privacy.html` (Contact section); legal review |
| P0-6 | P0 | Locality centres verified | **Open** | [H] Check the 30 centres; edit `public/localities.json` **and** `_shared/localities.ts` (sync test enforces equality); redeploy `submit-pin` |
| P0-7 | P0 | 150+ real pins in 15+ localities | **Open** (8 / 6) | [H] Google Form (NEXT-PHASES §3.2) → `npm run import-survey -- responses.csv --dry-run` → real import |
| P0-8 | P0 | Lighthouse mobile + budget Android over 4G | **Open** (local LCP/CLS/INP-proxy measured, see §6) | [H] Lighthouse on the live URL; a real phone |
| P1-1 | P1 | Docs reflect deployed state | **Done** (re-check after this release ships) | — |
| P1-2 | P1 | Cookie-free analytics + error visibility | **Open** | [H] Choose a provider; then about 3–5 h including a CSP update |
| P1-3 | P1 | Netlify-injected badge causes a CSP violation (reported by the earlier audit; the local test injects the CSP without Netlify's badge, so not re-verified) | **Open** | [H] Netlify site settings |
| P1-4 | P1 | Phase 3 cron jobs off | **DONE** (0009 applied 12 Nov) | — |
| P1-5 | P1 | DB + function tests in CI | **Mostly done**: DB harness + CI job added (CI job **NOT VERIFIED**: it only runs on push). Function *handlers* still have no tests against a running stack. | Push to see the CI job run; later, handler tests via `supabase start` (needs Docker) |
| P1-6 | P1 | Browser E2E | **Partly done**: read-only smoke suite (207 checks). **Submitting a pin, edit, delete, report and upload are not automated**, because they need a backend that accepts writes. | A local Supabase stack (Docker) or a staging project |
| P1-7 | P1 | Screen-reader pass | **Open** (keyboard focus in/out of dialogs verified automatically) | [H] VoiceOver/TalkBack on the list view and dialogs |
| P1-8 | P1 | Custom domain | **Open** | [H] Decide; see the coupled settings in the checklist |
| P1-9 | P1 | Rollback drill | **Open** | After deploy: NETLIFY_DEPLOYMENT_CHECKLIST.md §8 once |
| P2-1 | P2 | SPEC Phase 3 (listings, seekers, digests, unsubscribe) | Deferred (NEXT-PHASES §5) | About 50–80 h + domain + Resend |
| P2-2 | P2 | Locality SEO pages (SPEC §12) | Deferred; gated on ≥ 5 pins per locality | About 10–16 h |
| P2-3 | P2 | Cluster label average vs "medians only" | **Your decision** | 1–3 h |
| P2-4 | P2 | Waterlogging share denominator | **Done in code** (0009) | Apply 0009 |
| P2-5 | P2 | Map empty state | **Done** | — |
| P3-1 | P3 | Turnstile action check | **Done** | Deploy functions |
| P3-5 | P3 | JSON-LD | **Done** | — |
| P3-6 | P3 | Stale outlier flags | **Done in code** (0009) | Apply 0009 |
| P3-2/3/4/7 | P3 | zod 4 in functions; dependency bumps; drop `'unsafe-inline'` styles; one locality distance formula | Open | About 5–9 h |

## 5. Security findings

| Finding | Severity | Status |
|---|---|---|
| Unknown client IP put every caller in one rate-limit bucket (availability DoS: one user's 5 pins/day could block everyone) | Medium | **Fixed in code**, not deployed |
| Turnstile `action` not verified | Low | **Fixed in code**, not deployed |
| Privacy page misdescribed board deletion; IP hash on reports undisclosed | Low (transparency/legal) | **Fixed** in copy, not deployed |
| Client-IP forgeability (M-2) unconfirmed | Medium until verified | Tool ready; [H] run it |
| No backups | High (data loss, no DB rollback) | [H] secret fix |
| Production write paths not exercised since the 12 Nov deploy | Medium (unknown) | [H] smoke test |
| Secrets: none in `src/`, `dist/` or git history; `.env` never committed; `supabase/.temp` ignored. The only `sb_secret_` string in `dist/` is supabase-js's own prefix check. | — | PASS; **no rotation needed** |
| RLS/grants/views | — | PASS (80-check DB test + live read probes) |
| XSS | — | PASS: every user string reaches `innerHTML` through `escapeHtml`; CSP `script-src 'self' challenges.cloudflare.com`; 0 violations measured |
| File uploads | — | PASS (code): size, MIME, magic bytes, no GPS/XMP/IPTC; private bucket until approved; signed upload URLs |
| Dependencies | Low | `npm audit --omit=dev`: 0. 7 moderate in lint tooling only. zod 3 in functions (mitigated by the 32 KB body cap). |
| Error messages | — | PASS: functions return generic 500s and field *names* (never values) on 400 |

Note: the live project's database pooler is in **eu-central-1 (Frankfurt)**, while SPEC and README assumed Mumbai. This isn't a security issue, but it adds latency for Indian users. Moving regions means a new project and a data migration, so it's not worth doing before launch.

## 6. Performance findings

All of these are measured locally (headless Chrome, **software GL**, no network throttling, `vite preview`). **They are not field data and don't substitute for Lighthouse or a real phone (P0-8).**

| Metric | Target | Measured (6 viewports) | Verdict |
|---|---|---|---|
| LCP | ≤ 2.5 s | 72–752 ms | PASS locally; NOT VERIFIED on 4G |
| CLS | ≤ 0.1 | 0.000–0.005 | PASS locally |
| INP (Event Timing on real CDP clicks) | ≤ 200 ms | every interaction < 16 ms | PASS locally (proxy, not field INP) |
| Longest main-thread task | minimise | 0–476 ms (MapLibre style/worker boot under software GL) | INFO |
| Map-page JS excluding MapLibre (SPEC < 60 KB gz) | 60 KB | `main` 18.4 + `api` 3.7 KB gz (+0.03 KB from this work) | PASS |
| Filter / list at 20,000 pins | — | filter ≤ 6.9 ms; list render ≤ 5.4 ms, paint ≤ 31.2 ms | PASS |

No performance code was changed: the measurements didn't show a problem worth the risk.

## 7. External configuration still required

1. GitHub secret `SUPABASE_DB_URL` = Session pooler string (P0-1).
2. Supabase: review and apply **migration 0009**; deploy the 8 functions; confirm cron + Vault; admin user in `admins`; Auth redirect URLs (P0-2, P0-4).
3. `CLIENT_IP_HEADER` if `check-client-ip.sh` asks for it (P0-3).
4. Netlify: nothing new. The same 4 `VITE_*` variables; turn off the injected badge (P1-3).
5. Contact email in `privacy.html`; DPDP review (P0-5).
6. Locality verification; Google Form; data collection (P0-6, P0-7).
7. Optional: domain (P1-8), analytics provider (P1-2).

Exact deployment and post-deployment steps are in [NETLIFY_DEPLOYMENT_CHECKLIST.md](NETLIFY_DEPLOYMENT_CHECKLIST.md) §5–§7.

## 8. Counts

| | |
|---|---|
| Issues fixed in this work (code/docs; none deployed) | **14**: rows 1–12 of §2, plus P2-5 and P3-6 as separate items |
| Issues remaining | **20**: P0 × 8 (P0-5 partly done), P1 × 8 (P1-5 and P1-6 partly done), P2-1, P2-2, P2-3, and P3 small items as one |
| Tests passed | **341**: 40 Node + 14 Deno + 80 DB + 207 browser |
| Tests failed | **0** |
| Not run | Lighthouse; real phones; screen reader; full `security-check.sh` against production; any production write; CI `database` job; live Turnstile; `check-client-ip.sh` against production; backup workflow |
| Security issues remaining | 3 open, all verification or configuration: backups, unconfirmed client-IP header, untested production writes. **0 known code vulnerabilities.** |
