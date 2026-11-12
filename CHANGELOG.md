# Changelog

## Unreleased (prepared 12 Nov 2026): production readiness

**State:** on top of `b8181bd`. Migration 0009 applied and all 8 functions redeployed on 12 Nov 2026 (submit-pin v13). Frontend ships with this commit (`v0.4.0`). Client-IP probe: PASS (`cf-connecting-ip`). Ship it with [NETLIFY_DEPLOYMENT_CHECKLIST.md](NETLIFY_DEPLOYMENT_CHECKLIST.md) §5. Evidence: [PRODUCTION_TEST_RESULTS.md](PRODUCTION_TEST_RESULTS.md). Launch status: [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md).
Deploy order: **0009 → all 8 functions → frontend.**

### Added
- **Migration `0009_launch_hygiene.sql`:** unschedules the Phase 3 cron jobs (`send-digests`, `run-matching`); recomputes `public_stats_locality.pct_waterlog_severe` over rents that answered the monsoon question; `flag_outliers()` clears stale flags. No table or column changes; grants restated.
- **Map empty state:** "No rents match these filters" + **Clear filters** when filters hide every rent (`index.html`, `src/main.ts`, `src/styles/main.css`).
- **`WebSite` JSON-LD** on the home page (site description only).
- **`npm run test:db`** (`tests/db/run.sh`): throwaway Postgres + PostGIS with Supabase's roles and default grants; applies every migration; 80 security and stats checks, with a verified negative control. A CI job `database` runs it on push.
- **`npm run test:browser`** (`scripts/browser-smoke.mjs`): headless Chrome via the DevTools protocol, no new dependency. 6 viewports on the production build with the real CSP injected, plus every demo mode. Measures LCP, CLS, Event Timing and long tasks. Blocks all Supabase writes.
- **`scripts/diagnostics/ip-check/`:** CRON_SECRET-protected client-IP diagnostic that returns booleans only. Kept outside `supabase/functions/` so it is never deployed by accident; its temporary copy location is gitignored.
- 6 Deno tests (`_shared/turnstile_test.ts`; rate-limit keys in `_shared/shared_test.ts`).
- Reports: `PRODUCTION_READINESS_REPORT.md`, `PRODUCTION_TEST_RESULTS.md`.

### Modified
- `scripts/check-client-ip.sh`: works with the new diagnostic; reports "IP unknown" and "IP forgeable" separately.
- `.github/workflows/backup.yml`: validates `SUPABASE_DB_URL` (direct IPv6 host, transaction pooler, placeholder password, scheme, reachability) without printing it.
- `src/ui/stats.ts`: waterlogging footnote matches 0009.
- `NETLIFY_DEPLOYMENT_CHECKLIST.md`: rewritten as a reusable runbook (env vars, secrets, migrations, functions, smoke tests, rollback).
- Docs synced to the deployed state: `CLAUDE.md`, `README.md`, `DEPLOY.md` (§0 adds `test:db` and `test:browser`; §6 is now this release), `SECURITY_AUDIT_REPORT.md` §11/12, `PROJECT_CONTEXT.md`.

### Fixed
- **Shared rate-limit bucket:** a request with no known client IP was counted under the literal key `sha256('unknown' + salt)`, so all such users shared one quota (one person's 5 pins/day could block everyone). An unknown IP now gets no IP counter (the browser counter still applies) and a count-only warning is logged. Known-IP keys are unchanged (`_shared/crypto.ts` `rateLimitKeys`, `_shared/ratelimit.ts`).
- **Privacy page:** it said boards are deleted "sooner if three people report it gone". Since 0008 they are hidden and reviewed by an admin. It now also discloses the salted IP hash stored with reports.
- Stale outlier flags and the understated waterlogging share (via 0009, applied 12 Nov).
- Cron calling the non-existent `send-digests` function daily (via 0009, applied 12 Nov).

### Security
- Turnstile tokens must carry `action = submit` (empty is allowed for Cloudflare test keys; the hostname check still applies).
- Rate-limit availability fix above.
- No secrets found in `src/`, `dist/` or git history; no rotation needed.

### Performance
- No performance code changed. Measured locally (software GL, no throttling):
  - LCP 72–752 ms, CLS ≤ 0.005, all interactions < 16 ms across 6 viewports.
  - At 20,000 demo pins: filter ≤ 6.9 ms, list paint ≤ 31 ms.
  - Main bundle +0.03 KB gz.
- **Not field data:** Lighthouse and real-device tests are still pending.

### UI/UX
- Map empty state (above), styled with the existing floating-panel surface.

### Removed
- Nothing.

## 2026-11-12: security fixes, report-abuse migration, SEO/a11y, survey importer, CI

**Range:** `a5909dc` ("number type input scroll fix", 5 Nov) → `91fde5d` (12 Nov), on `main`.
Two commits: `c258588` (the release) and `91fde5d` (removes the temporary `ip-check` entry from `supabase/config.toml`).
**Baseline choice:** `a5909dc` is the last commit before this batch. The repository has a single branch (`main`), no merges and no tags.
**Deployment status (verified 12 Nov 2026, read-only):** all of it is already live.

| Part           | Evidence                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database       | `supabase migration list --linked`: 0001–0008 applied on production.                                                                                                                                           |
| Edge Functions | All 8 deployed functions downloaded and compared byte-for-byte with `91fde5d`: 20/20 files identical. `ip-check` is no longer deployed. Functions were deployed 11:12 UTC, before the commit (11:16 UTC).      |
| Frontend       | `guwahati-rent.netlify.app` serves the new CSP and `X-Frame-Options` headers, `robots.txt`, `sitemap.xml`, `og-default.png` and the MapLibre 6 worker. Its JS bundle contains strings introduced in `c258588`. |

Totals: **49 files**: 17 added, 32 modified, 0 deleted, 0 renamed (+2343 / −253 lines).

### Release summary

This release closes the open findings in `SECURITY_AUDIT_REPORT.md`:

- **M-1:** report abuse. Reports are de-duplicated per IP, and an admin reviews boards reported gone instead of their being auto-deleted.
- **M-2:** IP spoofing in rate limits.
- **M-3:** phone numbers and emails in public free text.
- **L-3:** photo metadata check on the server.
- **L-4:** Turnstile hostname check.
- An enforced Content-Security-Policy.

It also:

- upgrades MapLibre 5 → 6;
- adds SEO metadata, `robots.txt` and `sitemap.xml`;
- makes small accessibility and contrast fixes;
- adds the Phase 2b survey importer (a local script);
- adds four GitHub Actions workflows (CI, weekly backup, keepalive, nightly rebuild).

### Files changed

**Config and dependencies**

| File                   | Change type                        | Description                                                                                                                                                                                                            | Impact                                                                                                                                                                   |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`         | Modified                           | `maplibre-gl` ^5 → ^6.16. Removes `browser-image-compression` and `zod` (unused by `src/`; Edge Functions import zod via `npm:`). Adds scripts `test:deno` and `import-survey`. Adds `engines.node >=22`.              | Major map-library upgrade. Build and UI checks pass.                                                                                                                     |
| `package-lock.json`    | Modified                           | Lockfile for the above.                                                                                                                                                                                                | —                                                                                                                                                                        |
| `netlify.toml`         | Modified                           | Adds `Strict-Transport-Security`, `X-Frame-Options: DENY` and an enforced CSP with the Supabase host hard-coded. Adds a `Content-Type: text/javascript` header for `/assets/*.mjs`.                                    | The CSP must change if the Supabase project or the tiles origin changes. The `.mjs` header is required for the MapLibre 6 worker under `nosniff` (live header verified). |
| `vite.config.ts`       | Modified                           | Plugin that replaces `%SITE_URL%` in HTML, generates `robots.txt` and `sitemap.xml`, and prefetches the map chunk and worker. Falls back to `guwahati-rent.netlify.app` if `VITE_SITE_URL` is localhost at build time. | SEO. Depends on `VITE_SITE_URL` in Netlify.                                                                                                                              |
| `eslint.config.js`     | Modified                           | Now lints `supabase/functions` (with a `Deno` global). Allows `_`-prefixed unused variables.                                                                                                                           | Development only.                                                                                                                                                        |
| `supabase/config.toml` | Unchanged net                      | `c258588` added `[functions.ip-check]`; `91fde5d` removed it.                                                                                                                                                          | None.                                                                                                                                                                    |
| `.env.example`         | Modified (this audit, uncommitted) | `VITE_TILES_URL` commented out with a CSP warning. Adds `CRON_SECRET` and `CLIENT_IP_HEADER`. Marks the email variables as Phase 3.                                                                                    | Documentation only.                                                                                                                                                      |

**CI workflows**

| File                                    | Change type | Description                                                                                                             | Impact                                                                      |
| --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`              | Added       | typecheck, lint, test, test:deno and build on push and PR. Fails if `dist/` contains demo code or a secret-key pattern. | Passed on `c258588` and `91fde5d`.                                          |
| `.github/workflows/backup.yml`          | Added       | Weekly `pg_dump` of `public` to a 90-day artifact. Needs the `SUPABASE_DB_URL` secret.                                  | **First manual run failed at the `pg_dump` step** (see Outstanding issues). |
| `.github/workflows/keepalive.yml`       | Added       | Every 2 days, reads `public_stats_city` with the anon key.                                                              | Manual runs succeeded.                                                      |
| `.github/workflows/nightly-rebuild.yml` | Added       | Calls the Netlify build hook nightly.                                                                                   | Manual run succeeded.                                                       |

**Database and Edge Functions**

| File                                            | Change type | Description                                                                                                                                                                                            | Impact                                                             |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `supabase/migrations/0008_report_abuse.sql`     | Added       | Adds `ip_hash` to `reports` and `tolet_reports`, with partial unique indexes on (target, `ip_hash`) and an index on the gone-review queue. Re-revokes anon/authenticated access on both report tables. | Applied on production. Additive. Older rows have `ip_hash = null`. |
| `supabase/functions/_shared/crypto.ts`          | Modified    | `clientIp()` prefers `cf-connecting-ip` / `x-real-ip` over the client-controlled `X-Forwarded-For`. Optional `CLIENT_IP_HEADER` override. New `ipHash()`.                                              | Rate limits are harder to spoof (M-2).                             |
| `supabase/functions/_shared/http.ts`            | Modified    | Rejects request bodies over 32 KB.                                                                                                                                                                     | Caps parsing cost.                                                 |
| `supabase/functions/_shared/image-check.ts`     | Added       | Checks container structure: the declared type must match and there must be no XMP, IPTC or EXIF GPS.                                                                                                   | Used by `submit-tolet` (L-3).                                      |
| `supabase/functions/_shared/rules.ts`           | Modified    | `hasContactInfo()` / `contactProblems()`: emails and Indian phone numbers are rejected in `society_name`, `water_note`, `waterlog_note` and `one_liner`.                                               | M-3. Shared by the browser and the server.                         |
| `supabase/functions/_shared/pin-fields.ts`      | Modified    | Server-side pin validation now runs `contactProblems`.                                                                                                                                                 | Pins with phone or email in free text return 400.                  |
| `supabase/functions/_shared/turnstile.ts`       | Modified    | Rejects tokens whose `hostname` is not in `ALLOWED_ORIGINS` (when that is set).                                                                                                                        | L-4. `ALLOWED_ORIGINS` must list every site origin.                |
| `supabase/functions/_shared/shared_test.ts`     | Added       | 8 Deno tests (client IP, hashing, coordinates, storage paths, pin checks).                                                                                                                             | Tests.                                                             |
| `supabase/functions/admin-review/index.ts`      | Modified    | New actions `list_gone`, `keep_board` and `remove_board`, written to `moderation_log`.                                                                                                                 | Required by the new admin UI.                                      |
| `supabase/functions/report-pin/index.ts`        | Modified    | Stores `ip_hash`, so one IP counts once per pin.                                                                                                                                                       | Needs 0008.                                                        |
| `supabase/functions/report-tolet/index.ts`      | Modified    | Same, per board.                                                                                                                                                                                       | Needs 0008.                                                        |
| `supabase/functions/submit-tolet/index.ts`      | Modified    | Downloads both uploaded images and runs `inspectImage`, rejecting a wrong type or metadata.                                                                                                            | L-3. One extra storage read per submission.                        |
| `supabase/functions/tolet-maintenance/index.ts` | Modified    | No longer deletes boards with 3+ gone reports; they wait for an admin.                                                                                                                                 | M-1. Behaviour change for moderators.                              |
| `supabase/functions/deno.lock`                  | Modified    | Lockfile.                                                                                                                                                                                              | —                                                                  |

**Frontend**

| File                    | Change type | Description                                                                                                                                                                                                                                          | Impact                                                                |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/map.ts`            | Modified    | MapLibre 6 namespace import. The worker is emitted via `?url` and `setWorkerUrl()`.                                                                                                                                                                  | Required for MapLibre 6 under the CSP.                                |
| `src/forms/rent-pin.ts` | Modified    | Client-side `contactProblems` check.                                                                                                                                                                                                                 | Verified in the browser: a phone number in the one-liner is rejected. |
| `src/pages/admin.ts`    | Modified    | "Reported gone" queue with Keep and Remove buttons.                                                                                                                                                                                                  | Needs the new `admin-review` actions.                                 |
| `src/ui/pin-card.ts`    | Modified    | Shows "Approximate location" for `location_approx` pins and "shared via our rent survey" for `source='survey'` pins.                                                                                                                                 | Uses columns from 0004 (already live).                                |
| `src/ui/stats.ts`       | Modified    | Water column header gets an asterisk.                                                                                                                                                                                                                | Cosmetic.                                                             |
| `src/styles/main.css`   | Modified    | `--teal-2` darkened (#087f98 → #077590, documented 5.3:1 on white). Map/List toggle buttons are the 44px tap target. Phones now show the pin count on its own line. MapLibre control-size specificity fix. `.cols-N` classes replace inline `style`. | Visual and a11y.                                                      |

**HTML pages**

| File                                       | Change type | Description                                                                                                                                                      | Impact           |
| ------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `index.html`                               | Modified    | Canonical, Open Graph and Twitter meta. Visually hidden `<h1>`. `style="--cols:N"` → `cols-N` classes. The pin-details body becomes a focusable labelled region. | SEO and a11y.    |
| `about.html`, `privacy.html`, `terms.html` | Modified    | Description, canonical and OG meta. `about.html` gains a "To-Let boards" section.                                                                                | SEO and content. |
| `admin.html`                               | Modified    | Retitled "Moderation". Adds the "Reported gone" section.                                                                                                         | Admin only.      |
| `unsubscribe.html`                         | Modified    | Placeholder replaced with a styled `noindex` page explaining that no emails are sent yet.                                                                        | Content.         |
| `public/og-default.png`                    | Added       | 1200×630 social preview image.                                                                                                                                   | SEO.             |

**Scripts and tests**

| File                                                                                                               | Change type | Description                                                                                                                                                                                    | Impact                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `scripts/import-survey.ts`, `scripts/survey.ts`                                                                    | Added       | Phase 2b CSV importer: consent, locality and rent checks, ≤150 m deterministic jitter, 3dp rounding, idempotent via `import_ref`. Runs locally with the service-role key from the environment. | Not part of the deployed site. Not run against production in this audit. |
| `scripts/check-client-ip.sh`                                                                                       | Added       | Probe for M-2 using the temporary `ip-check` function.                                                                                                                                         | That function is now deleted, so the script cannot run as-is.            |
| `tests/image-check.test.ts`, `tests/import-survey.test.ts`, `tests/localities-sync.test.ts`, `tests/rules.test.ts` | Added       | Node tests for the above.                                                                                                                                                                      | 40/40 Node tests pass.                                                   |

**Documentation**

| File                                                  | Change type | Description                                   | Impact                                                                                                          |
| ----------------------------------------------------- | ----------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DEPLOY.md`                                           | Added       | Deploy order, secrets, rollback.              | §6 "Pending release" is now **out of date** (everything is deployed).                                           |
| `SECURITY_AUDIT_REPORT.md`, `PROJECT_GAP_ANALYSIS.md` | Added       | Audit and gap analysis.                       | Documentation.                                                                                                  |
| `README.md`, `CLAUDE.md`, `PROJECT_CONTEXT.md`        | Modified    | Status, commands, survey import, Ops section. | `CLAUDE.md` and `README.md` still say 0008 and the security fixes are "not deployed", which is **out of date**. |

### New functionality

- **Admin "Reported gone" queue:** boards hidden after 3 "gone" reports can be kept (back on the map) or removed (photos deleted overnight). Logged to `moderation_log`.
- **Survey import (Phase 2b):** `npm run import-survey -- responses.csv [--dry-run]`.
- **Pin card labels:** "Approximate location" and "shared via our rent survey".
- **SEO:** canonical URLs, Open Graph and Twitter cards, `og-default.png`, generated `robots.txt` (disallows `/admin.html` and `/unsubscribe.html`) and `sitemap.xml`.
- **GitHub Actions:** CI, weekly DB backup, keepalive, nightly rebuild.

### Modified functionality

- Boards reported gone 3+ times are **no longer auto-deleted** by `tolet-maintenance`; they stay hidden until an admin decides.
- Reports count once per IP as well as once per browser.
- The pin form and `submit-pin`/`edit-pin` reject phone numbers and emails in public free-text fields.
- `submit-tolet` rejects photos whose bytes do not match the declared type or that carry GPS, XMP or IPTC metadata.
- Turnstile tokens solved on other hostnames are refused.
- Request bodies over 32 KB are refused by all functions.
- The map runs on MapLibre 6. The map chunk and worker are prefetched after first paint.

### Fixed issues

Each fix is backed by code plus a test or a live check:

- **M-2:** IP used for rate limits could be forged via `X-Forwarded-For`. Deno test "clientIp prefers platform-set headers…" passes.
- **M-3:** contact details could be published in free text. Node test plus browser check: "Please remove phone numbers and email addresses…" is shown.
- **M-1:** one person with many browser ids could get a board deleted. Fixed by migration 0008 (applied) plus `tolet-maintenance` and `admin-review`.
- **L-3:** server-side image metadata check. `tests/image-check.test.ts` passes.
- **L-4:** Turnstile hostname check. Covered by code; no live test.
- **Phone legend:** the pin count was hidden on phones. It now wraps to its own line.

### Security changes

- Enforced CSP, HSTS and `X-Frame-Options: DENY`. All three are live.
- M-1, M-2, M-3, L-3 and L-4 above.
- Migration 0008 re-revokes anon/authenticated access on `reports` and `tolet_reports`.
- CI fails the build if `dist/` contains demo code or a secret-key pattern.

### Performance changes

- The map chunk and MapLibre worker are prefetched once the shell paints (`<link rel="prefetch">` present in the built `index.html`). No before/after measurement was made, so the improvement itself is **not verified**.
- `zod` and `browser-image-compression` were removed from the frontend dependencies. They were not imported by `src/`, so the bundle size effect is likely nil.

### UI/UX changes

- Darker interactive teal for contrast.
- Map/List toggle buttons are the full 44px tap target.
- Pin count shown on phones.
- MapLibre zoom and locate controls keep the app's sizing.
- Pin-details panel is a scrollable focusable region.
- Visually hidden page `<h1>`.
- Admin page retitled "Moderation".
- "Water comes in*" header in stats.

### Breaking changes

- **Moderation workflow:** boards with 3+ gone reports now need an admin decision in `/admin.html`. Until then they stay hidden, and their photos stay in storage until removed or expired.
- **Pins with contact details:** new and edited pins containing a phone or email in a public text field are rejected (HTTP 400). Existing pins are not re-checked.
- **Turnstile hostname:** if `ALLOWED_ORIGINS` omits an origin the site is served from (for example a custom domain added later), Turnstile-protected forms there will fail.
- **Coupled values:** the CSP hard-codes the Supabase project host. Changing project, tiles origin or domain requires updating `netlify.toml`, `ALLOWED_ORIGINS`, the Turnstile widget domains and the Auth redirect URLs together.
- **Database:** no breaking change. 0008 is additive.

### Outstanding issues

- **`weekly-backup` workflow failed** on its first run (step `pg_dump`). The cause needs the run log (GitHub auth): either `SUPABASE_DB_URL` is unset or the connection failed. Until it passes there is **no database backup**, which is the only rollback path for the database.
- **Netlify-injected badge causes a CSP violation:** `/.netlify/scripts/hud` adds an `nl-badge-frame` iframe whose inline script the CSP blocks. It is not app code: with that script blocked, 0 violations. `DEPLOY.md` §4 expects 0 violations.
- **M-2 live probe result is unknown:** `ip-check` has been deleted and `CLIENT_IP_HEADER` is not set. That is correct if the probe reported PASS, but no record of the result exists in the repo.
- **Full `npm run security-check` not run:** its write probes (`PATCH pins`, `DELETE pin_contacts`) target production. Only its read-only checks were run (17/17 PASS).
- **End-to-end submissions not tested after the function update:** rent pin, To-Let upload, report and admin keep/remove were not exercised against production. All write requests were blocked during browser QA.
- **No git tags:** `DEPLOY.md` asks for one per release; none exist, so there is no named rollback point.
- **Stale docs:** `CLAUDE.md`, `README.md` (status line) and `DEPLOY.md` §6 still describe this release as not deployed.
- **`scripts/check-client-ip.sh`** depends on a function that no longer exists.
