# Wrap report: guwahati-rent

**Verdict (updated 26 Nov, evening): SHIP-WITH-RISK for maintenance mode; DO-NOT-SHIP for a public launch until the map has real rents.** The backup leak, missing contact, fake deletion and policy gaps are fixed and verified on production. Open: 1 P0 (empty map, PW-02) and 4 P1s (cron unverified, Frankfurt project, screen-reader pass, locality centres).

*Original verdict (26 Nov, afternoon): DO-NOT-SHIP, with three P0s (the first two now closed):*
1. Weekly database backups are published as artifacts of a public GitHub repo.
2. The privacy policy promises a deletion contact that does not exist.
3. The live map has zero rents.

The engineering underneath is sound. Every automated gate is green, access control holds on production, and every free-text sink is escaped. It is **safe to keep running in maintenance mode** only once P0-1 is fixed.

Audit date 26 Nov 2026 · branch `wrap/release-audit` (from `main` @ `518e60e`, tag `v0.5.0`) · auditor: Claude (AI). The ledger with evidence is in [PENDING.md](PENDING.md).

## Scorecard

Open findings only. Fixed items are in the ledger.

| Domain | Score /10 | P0 | P1 | P2 | P3 | Verdict |
|---|---|---|---|---|---|---|
| A. Architecture & code health | 8 | 0 | 0 | 0 | 2 | Ship |
| B. Security | 6 | 1 | 0 | 2 | 4 | **Block** (backups) |
| C. Privacy & legal | 3 | 1 | 4 | 0 | 1 | **Block** |
| D. Accessibility (WCAG 2.2 AA) | 7 | 0 | 1 | 0 | 0 | Ship-with-risk (manual AT pass not done) |
| E. Design & UX | 8 | 0 | 0 | 0 | 0 | Ship |
| F. Performance | 7 | 0 | 0 | 1 | 0 | Ship-with-risk |
| G. Reliability, observability, CI/CD | 5 | 0 | 1 | 5 | 0 | Ship-with-risk |
| H. Documentation & handoff | 7 | 0 | 0 | 0 | 2 | Ship |
| Product (data) | 1 | 1 | 1 | 0 | 0 | **Block** (empty map) |
| **Total open (afternoon)** | | **3** | **7** | **8** | **9** | **DO-NOT-SHIP** |
| **Total open (evening, after PR #3 + deploy)** | | **1** | **4** | **8** | **9** | **SHIP-WITH-RISK** (maintenance) |

## Top 5 risks in plain language

1. **Anyone with a GitHub account can download your database.** `backup.yml` uploads an unencrypted `pg_dump` every week, and the repo is public. I listed all 5 dumps through GitHub's public API without logging in. The 12 Nov dump contains report notes, an admin user id and one pin's private society name, size and note. Each future week would publish every pin, report and consent record. *Fix: make the repo private now, or encrypt the dump before upload. Then delete the existing artifacts.*
2. **People are told they can ask you to delete their data, and there is no way to reach you.** `privacy.html` says "contact us (see below)", and the Contact section is empty. The DPDP Act requires a working grievance channel.
3. **"Delete my pin" doesn't delete.** It sets `status='archived'`, and nothing ever removes archived rows. The free-text note, society name, exact size and location stay in the database and every backup indefinitely. The privacy policy says deleting your pin is how you withdraw consent.
4. **The site has no content.** On 26 Nov the live `public_pins`, `public_tolet` and stats views were all empty. The STATUS.md claim of "150+ pins imported" is not true for this project. A public launch now shows an empty map.
5. **Nothing tells you when it breaks.** No uptime alert, no error tracking, and the To-Let expiry cron has never been confirmed on the Mumbai project. If cron fails, photos are kept past the 60 days the privacy policy promises, and nobody notices.

## What was tested

| Check | Result |
|---|---|
| typecheck · lint · unit · Deno · DB suite · build | 0 errors · 0 problems · 58/58 · 23/23 · 94/94 · ok (before and after the fixes) |
| Browser smoke (headless Chrome, 6 viewports, prod CSP) | 247/247 with 1 live pin; 211 pass / 18 fail after the pin was deleted. All 18 are the 3 checks that need ≥1 live pin (PW-28) |
| `scripts/security-check.sh` against production (approved by owner) | 65 pass, 1 fail: "public_pins returns the test row". Precondition: no seed row. Leak checks are vacuous on an empty DB; the local DB suite covers them with data |
| Lighthouse mobile, live site | `/` Perf 72 · A11y 100 · BP 93 · SEO 100 · LCP 2.7 s · CLS 0.025 · TBT 960 ms. `/about` A11y 95 (contrast), now fixed |
| Lighthouse accessibility (axe), 8 routes of the fixed build | 100, 0 failed audits each (initial state only; dialogs and forms not scanned) |
| Code review | 25 `innerHTML` sinks (all user text through `escapeHtml`); 8 Edge Functions (zod, Turnstile, rate limit, ownership checks, image magic-byte + metadata check); grants/RLS in all 10 migrations |
| Secrets | Regex scan of the full git history: none (1 hit is a `<password>` placeholder). `.env` never committed. gitleaks/trufflehog not run (not installed) |
| `npm audit` | 0 in runtime deps; 7 moderate in dev tooling (typescript-eslint → minimatch) |

**Not tested:** screen readers (VoiceOver/TalkBack/NVDA), real devices on 4G, 200%/400% zoom and text-spacing by hand, Turnstile against a real Cloudflare widget, the admin page signed in, cron/Vault on production, legal review. Each is in [HUMAN_REQUIRED.md](HUMAN_REQUIRED.md).

## Fixed in this pass

| Commit | Change | Proof |
|---|---|---|
| `3683d23` | WhatsApp button contrast 4.3:1 → 5.41:1 (WCAG 1.4.3) | Lighthouse `/about.html` color-contrast 0 → 1, A11y 95 → 100 |
| `ef57cf7` | CI: `permissions: contents: read`, actions pinned to SHAs, `npm audit --omit=dev` gate, Dependabot | YAML parses; `npm audit --omit=dev` = 0 |
| (docs commit) | README rewritten to the current state; STATUS.md stale lines corrected; this report set; SECURITY.md | — |
| (follow-up) | **PW-01** privacy contact on every page · **PW-26** `edit-pin` hard-deletes, migration `0011` purges removed pins after 30 days · **PW-27** policy states region, processors, retention · **PW-25** backups age-encrypted, job refuses without a key | unit 59/59, DB 103/103 (9 new erasure checks), policy test pins the new numbers to `cleanup()` and `backup.yml` |

## Domain notes

**A. Architecture.** Clear boundaries: browser reads views, functions write, shared rules in `_shared/rules.ts` imported by both sides, and one GeoJSON source. The scale limit is the client loading all of `public_pins` in one request (fine to ~20k, which `?demo=max` exercises). Large files: `main.css` 1970 lines, `index.html` 1311, `showcase.ts` 1230 (dev-only). Undocumented decisions are written up as ADRs in [adr/](adr/).

**B. Security.** Strong baseline: anon is denied every private table on production, all writes go through functions, `script-src` allows no `unsafe-inline` or `unsafe-eval`, HSTS has preload, Turnstile checks hostname and action. Gaps:
- backups (P0);
- `style-src 'unsafe-inline'` (P3);
- the rate-limit IP falls back to `x-forwarded-for` unless `CLIENT_IP_HEADER` is pinned (P3, `_shared/crypto.ts:12`);
- edit tokens live in `localStorage` (acceptable under a strict `script-src`);
- no branch protection (P2).

See [THREAT_MODEL.md](THREAT_MODEL.md).

**C. Privacy.**
- P0: the contact is missing.
- P1: deletion doesn't erase.
- P1: the policy omits GitHub as a processor and doesn't state the backup retention, the pin retention or the data region.
- P1: no legal review.
- P1: the Frankfurt project may still hold data.

No analytics or cookies, so no consent banner is needed. Licences: all 38 runtime packages are permissive (21 MIT, 8 ISC, 7 BSD, 1 0BSD, 1 MIT/Apache-2.0; no GPL/AGPL/unknown); the Protomaps/OSM data needs ODbL attribution, which the map shows.

**D. Accessibility.** Automated: clean on all routes. Code: skip link, `:focus-visible` everywhere, `prefers-reduced-motion` respected, live regions for toasts, tap-to-place as a non-drag alternative (2.5.7), and focus moves into and back from dialogs (scripted). Not established: screen-reader behaviour of the map, list and dialogs; zoom and text spacing. See [ACR_WCAG22_AA.md](ACR_WCAG22_AA.md).

**F. Performance.** Mobile LCP 2.7 s on `/` misses the 2.5 s target, and TBT is 960 ms, mostly MapLibre parse and compile. Static pages are 99–100.

**G. Reliability.**
- Backups run weekly and a restore was verified on 12 Nov (Frankfurt), but they are public (P0).
- No uptime or error alerting.
- No rollback drill.
- Browser tests depend on live data.

**H. Docs.** About 20 root-level dated reports. The README is now the entry point and labels them historical.
