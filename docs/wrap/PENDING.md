# Pending-work ledger

Swept 26 Nov 2026 against `main` @ `518e60e` (tag `v0.5.0`); updated after the Phase 2 audit and the fixes on branch `wrap/release-audit`.
Severity: P0 blocker · P1 fix before launch · P2 major · P3 minor. Owner: AI = fixable in the repo; Human = needs the founder, an account, a device or a lawyer.

## Baseline (re-run 26 Nov, local unless stated)

| Check | Before | After fixes |
|---|---|---|
| `npm run typecheck` / `lint` | 0 errors / 0 problems | same |
| `npm test` | 58/58 | 58/58 |
| `npm run test:deno` | 23/23 | 23/23 |
| `npm run test:db` | 94/94 | 94/94 |
| `npm run build` | ok | ok |
| `npm run test:browser` | 247/247 (1 live pin) | 211/229. The 18 failures are 3 checks × 6 viewports, all needing ≥1 live pin; production went to 0 pins between runs (PW-28) |
| `npm audit` | 7 moderate, dev-only; 0 runtime | same; runtime audit is now a CI gate |
| Lighthouse a11y, 8 routes (local build) | `/about` 95 (contrast) | 100 on all 8 |
| `security-check.sh` on production | not run since 2c.2 | 65/66; the 1 needs a seed row |
| Live headers | HSTS preload, CSP, nosniff, XFO, Referrer-Policy, Permissions-Policy | unchanged |
| Secret scan of git history (regex) | 0 real secrets | — |

## Ledger

| ID | Area | Item | Evidence | Sev | Effort | Owner | Status |
|---|---|---|---|---|---|---|---|
| PW-25 | Security / privacy | **DB backups publicly downloadable.** `backup.yml` uploads unencrypted `pg_dump` artifacts in a public repo. 5 dumps listed without auth; 12 Nov dump holds 12 pins (1 with society name, sqft, note), 2 report notes + hashes, the admin user id | `curl https://api.github.com/repos/myogesh97/guwahati-rent/actions/artifacts` (no token) → 5 `db-backup-*`; `pg_restore --data-only` row counts; `.github/workflows/backup.yml:45` | P0 | S | Human (private repo or key) → AI (encrypt) | Open |
| PW-01 | Legal / privacy | Privacy page has no contact, but tells users to "contact us (see below)" for deletion. No DPDP grievance channel | `privacy.html:111`, `:119-121`; live page | P0 | S | Human (address) → AI | Open |
| PW-02 | Product / data | Live map is empty: `public_pins` 0, `public_tolet` 0, stats 0 (was 1 test pin earlier, since deleted). "150+ imported" not in this project | live `content-range: */0` on all four views, 26 Nov | P0 | M | Human | Open |
| PW-26 | Privacy | "Delete my pin" only sets `status='archived'`; `cleanup()` never removes pins, so note, society name, sqft and location are kept forever (and in backups). Policy: deleting is how you withdraw consent | `supabase/functions/edit-pin/index.ts:64`; `0006_reports_moderation.sql:46-80` (no pin delete) | P1 | M | AI after approval (migration + function deploy) | Open: needs approval |
| PW-27 | Legal | Privacy policy omits GitHub (backups) as a processor, the 90-day backup retention, the pin retention period and the data region; dated 15 Nov | `privacy.html` (full text reviewed) | P1 | S | Human (facts) → AI | Open |
| PW-03 | Ops / privacy | Cron + Vault not verified on Mumbai. If `tolet-maintenance` fails, photos outlive the promised 60 days | `STATUS.md` P0-4; `0005_tolet_cron.sql:6` | P1 | S | Human | Open |
| PW-05 | Privacy | Frankfurt project `apgdczuofczobxaggsfy` "paused or deleted" is unverified; it may still hold data | `STATUS.md` | P1 | S | Human | Open |
| PW-06 | Accessibility | No screen-reader / zoom / reflow pass; 20 ACR rows NEEDS-MANUAL | `ACR_WCAG22_AA.md` | P1 | M | Human | Open |
| PW-07 | Data quality | 30 locality centres not checked on the ground | `public/localities.json` | P1 | M | Human | Open |
| PW-08 | Legal | No legal review of Privacy/Terms (DPDP) | `STATUS.md` P0-5 | P1 | M | Human (review or written acceptance) | Open |
| PW-04 | Security | Production security gate not run since 2c.2 | — | P1 | S | AI | **Done**: 65/66 pass; the 1 failure is the missing seed row. Leak checks are vacuous on an empty DB |
| PW-09 | Performance | Mobile LCP 2.7 s on `/` (target 2.5 s), TBT 960 ms, Perf 72; real-device 4G not tested | Lighthouse 12 mobile, live `/` | P2 | M | AI (optimise) + Human (device) | Open |
| PW-10 | CI | No branch protection on `main` (public repo) | `gh api …/branches/main/protection` → 404 | P2 | S | Human | Open |
| PW-11 | CI | No security or a11y gate, no Dependabot | `ci.yml` | P2 | S | AI | **Partly done** (`ef57cf7`): runtime `npm audit` gate + Dependabot. Open: GitHub secret scanning (Human), a11y gate in CI |
| PW-12 | CI | Actions on mutable tags; no `permissions:` | workflows | P2 | S | AI | **Done** (`ef57cf7`) |
| PW-13 | Observability | No uptime alert or error tracking | — | P2 | S | Human | Open |
| PW-14 | Ops | No rollback drill; no incident runbook | — | P2 | S | Human + AI | **Runbook done** (`HUMAN_REQUIRED.md`); drill open |
| PW-15 | Ops | Moderation routine not written | — | P2 | S | Human + AI | Open |
| PW-16 | Ops | Admin row and Auth redirect URLs not confirmed | — | P2 | S | Human | Open |
| PW-28 | Testing | Browser suite reads live production data; 3 checks fail when production is empty, so the main journey can't be proven by CI on an empty DB | `scripts/browser-smoke.mjs` header; 18 FAIL on 26 Nov | P2 | M | AI | Open |
| PW-30 | Accessibility | WhatsApp button contrast 4.3:1 (WCAG 1.4.3 AA) | Lighthouse `/about.html` color-contrast; `page.css:151`, `main.css:44` | P2 | S | AI | **Done** (`3683d23`): 5.41:1, Lighthouse 100 |
| PW-17 | Privacy | Dead Phase 3 tables with email/phone columns; live `/unsubscribe.html` | `0001_init.sql:66-130` | P3 | M | AI after approval (migration) | Open |
| PW-18 | Code | Phase 3 comments in functions; Phase 3 block in `.env.example` | `submit-pin/index.ts:1`, `edit-pin/index.ts:5`, `admin-review/index.ts:92` | P3 | S | AI | Open |
| PW-19 | Docs | README/STATUS status drift | `README.md:5`; `STATUS.md` tag row | P3 | S | AI | **Done**: README rewritten, STATUS corrected |
| PW-20 | Governance | No LICENSE, SECURITY.md, CONTRIBUTING | — | P3 | S | Human + AI | **SECURITY.md done**; licence is the owner's choice |
| PW-21 | Dependencies | 7 moderate dev-only advisories (typescript-eslint ≤ 8.72.2) | `npm audit` | P3 | S | AI (Dependabot will PR) | Open |
| PW-22 | Code health | Files > 400 lines (`main.css` 1970, `index.html` 1311, …) | `wc -l` | P3 | L | AI | Won't fix (wrapped) |
| PW-23 | Security | `style-src 'unsafe-inline'` | `netlify.toml` | P3 | M | AI | Won't fix (STATUS) |
| PW-24 | Repo | 3 merged branches on origin | `git branch -a --merged main` | P3 | S | Human | Open |
| PW-29 | Security | Live pages log a CSP "inline script" violation in Lighthouse; the only inline `<script>` is `application/ld+json` (not executed). Source not identified | Lighthouse `errors-in-console` on `/`, `/about`, `/privacy` | P3 | S | AI | Open: investigate |
| PW-31 | Security | Rate-limit IP falls back to `x-forwarded-for` unless `CLIENT_IP_HEADER` is set; whether it is set on Mumbai is unknown | `_shared/crypto.ts:12-16` | P3 | S | Human (`npx supabase secrets list`) | Open |

Counts of open items: **P0 3 · P1 7 · P2 8 (2 partly done) · P3 9** (2 of the P3s are won't-fix).

## Remediation plan (Phase 3)

| ID | Sev | Domain | Fix | Effort | AI-fixable? | Depends on |
|---|---|---|---|---|---|---|
| PW-25 | P0 | Security | Repo private (or `age`-encrypt in `backup.yml`), then delete the 5 artifacts | S | Partly (encryption) | Owner choice |
| PW-01 | P0 | Privacy | Contact on `privacy.html` + every footer + SECURITY.md | S | Yes | Owner's email |
| PW-02 | P0 | Product | Import real data or state the empty map plainly | M | Partly (copy) | Owner |
| PW-26 | P1 | Privacy | Hard delete in `edit-pin`; migration 0011 purges archived > 30 days; DB tests | M | Yes | Owner approval + deploy |
| PW-27 | P1 | Privacy | Policy text: processors, retention, region, date | S | Yes | Owner facts |
| PW-03/05 | P1 | Ops | SQL checks; delete Frankfurt | S | No | — |
| PW-06/07/08 | P1 | A11y/Data/Legal | Manual pass, locality check, legal review or acceptance | M | No | — |
| PW-28 | P2 | Testing | Stub `public_pins` in the browser suite (fixture) so the journey runs on an empty DB | M | Yes | — |
| PW-09 | P2 | Perf | Static first paint before MapLibre; defer map JS until idle | M | Yes | — |
| PW-17/18 | P3 | Privacy/Code | Migration dropping Phase 3 tables; remove `/unsubscribe.html` and dead comments | M | Yes | Owner approval |

**Batches.** Batch 1 (P0) waits on the owner's three answers. Batch 2 (P1) needs approval for a migration and a function deploy. Batch 3 (P2 quick wins): the contrast fix, CI hardening and runbook are done.

## Swept and clean

- `TODO/FIXME/HACK/XXX`: 1 hit (PW-01). `@ts-ignore`, `eslint-disable`, `any`: 0. Skipped or `.only` tests: 0.
- 25 `innerHTML` sinks: every user-supplied string goes through `escapeHtml` (`src/format.ts:89`); the rest are numbers, enum labels or constants.
- `admin-review` checks the Auth token and the `admins` row before parsing the body.
- `console.*` in functions logs field names and error messages only.
- Every `VITE_*` and `Deno.env` variable used is in `.env.example`.
- `.env` never committed. Demo code kept out of `dist/` (CI asserts it).
- Runtime licences: 38 packages, all permissive. OSM/Protomaps attribution shown (`src/map.ts:88`).
- To-Let boards at 4 dp is by design (`NEXT-PHASES.md:93`).
