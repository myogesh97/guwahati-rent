# Guwahati Rent: Website Launch Gap Analysis

**Date:** 12 Nov 2026 · **Baseline:** `c78d677` (live `v0.4.0`) + this change (not deployed)
**Scope:** everything outstanding across product, SEO, accessibility, security, backend, performance, infrastructure, privacy, legal, analytics, operations and documentation. It merges the still-open items from [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) (IDs in brackets) with the findings of this audit.

**Priorities:**
- **P0:** must be done before public launch.
- **P1:** required for reliable operation (within weeks of launch).
- **P2:** important improvement.
- **P3:** optional.

**[H]** means it needs you, a dashboard or a device. It can't be done in the repo. Effort is engineering or owner hours.

## Summary

| | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Open items | 9 | 10 | 9 | 7 |

**Code-level vs production readiness:**
- **Code level:** the code is in good shape. 0 known code vulnerabilities, RLS proven by 80 DB checks, 207 browser checks, 0 axe violations.
- **Production:** most P0 items are external verification, legal or **data**. The single largest gap is that the map holds **9 rents in 6 localities**, against the spec's own launch bar of **150 rents in 15 localities** (SPEC §17).

---

## P0: must be done before public launch

**P0-1 Ship this change (a11y/SEO fixes) to production**
- *What:* deploy the working tree of this audit (`v0.4.1`): To-Let boards in the list view, the toast live region, forced-colours focus, the skip link, placement instructions, the footer, the 404 page, the sitemap and the glyph cache.
- *Why:* the live site still has the WCAG 2.1.1, 2.4.7 and 4.1.3 failures fixed here.
- *Evidence:* [SEO_A11Y_TEST_RESULTS.md](SEO_A11Y_TEST_RESULTS.md) §5 before/after.
- *Files:* see the CHANGELOG "Unreleased" entry.
- *Depends on:* review and commit.
- *Effort:* 0.5 h.
- *Done when:* the live `/404-test` path shows the branded 404; the list view shows a "To-Let boards" heading whenever a board is approved; `/map-assets/*` returns `max-age=86400`.

**P0-2 Production smoke test of every write path** [P0-2] [H]
- *What:* on a real phone against production: submit a rent, edit it, delete it, report a pin, upload a To-Let board, approve it in admin.
- *Why:* the write paths haven't been exercised since the 12 Nov function deploy. Turnstile can't be tested locally.
- *Evidence:* PRODUCTION_READINESS_REPORT §4; this audit's valid-submit test is NOT VERIFIED.
- *Systems:* Edge Functions, Turnstile, Storage.
- *Effort:* 1 h.
- *Done when:* every step in NETLIFY_DEPLOYMENT_CHECKLIST.md §7 passes and the test pin and board are cleaned up.

**P0-3 Cron and Vault verified** [P0-4] [H]
- *What:* confirm `cleanup`, `flag-outliers` and `tolet-maintenance` actually run.
- *Why:* board expiry, photo deletion and the 90-day report-note deletion are privacy promises that depend on them.
- *Evidence:* not checked since 0009.
- *Effort:* 0.5 h.
- *Done when:* `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 20;` shows recent `succeeded` rows for all three.

**P0-4 Contact address on the Privacy page** [P0-5] [H]
- *What:* a real email for deletion requests and questions.
- *Why:* the Privacy page tells users who cleared their browser to "contact us (see below)", and there is nothing below. It is also the only correction or removal route for data subjects, and the only abuse channel outside the Report button.
- *Evidence:* `privacy.html` Contact section placeholder and TODO comment.
- *Depends on:* an address (ideally on the custom domain, P1-1).
- *Effort:* 0.5 h.
- *Done when:* the address is on the Privacy page (and in the footer of every page, which satisfies WCAG 3.2.6 once help exists) and mail to it is monitored.

**P0-5 Legal review of Privacy and Terms (India DPDP Act 2023)** [P0-5] [H]
- *What:* a lawyer reviews both pages. Points to raise:
  - **retention** not stated for rent pins (kept until deleted), for rate-limit hashes (2 days, `cleanup()`), and for report IP hashes;
  - **backups**: weekly `pg_dump` artifacts in GitHub contain the same data;
  - the **Frankfurt (eu-central-1)** database region (cross-border transfer);
  - a grievance contact;
  - Terms: governing law, liability, and a takedown procedure for user content and photos.
- *Why:* SPEC §13 marks this [HUMAN] before launch; users submit data publicly.
- *Evidence:* `privacy.html`, `terms.html`; `supabase/migrations/0006_reports_moderation.sql` cleanup intervals.
- *Effort:* external; 2 h to apply the changes.
- *Done when:* the reviewed wording is published with an updated "Last updated".

**P0-6 Locality centres verified** [P0-6] [H]
- *What:* check the 30 centres in `public/localities.json` (spelling and position); keep `_shared/localities.ts` identical (the sync test enforces this); redeploy `submit-pin`.
- *Why:* every pin's locality label, the stats and future SEO pages depend on them. SPEC §11 calls them approximate.
- *Effort:* 2–3 h.
- *Done when:* each centre is confirmed on the map by someone who knows Guwahati.

**P0-7 Reach the data bar: 150+ real rents across 15+ localities** [P0-7] [H]
- *What:* run the Google Form → `npm run import-survey -- responses.csv --dry-run` → real import.
- *Why:* SPEC §17 forbids any public post below this. With 9 rents the stats panel shows almost nothing, and no SEO page can exist.
- *Evidence:* live `public_pins` = 9 rents, 6 localities; `public_stats_locality` has 1 row (Lalganesh 2 BHK, n = 3); `public_stats_city` 1 row.
- *Effort:* weeks of outreach.
- *Done when:* `select count(*), count(distinct locality_slug) from pins where status='active'` ≥ 150 / 15.

**P0-8 Field performance check** [P0-8] [H]
- *What:* Lighthouse mobile on the live URL plus a budget Android phone on 4G.
- *Why:* lab results conflict: Performance 55 (simulated) vs 81–93 (applied throttling); LCP 2.2–4.0 s against a 2.5 s target; SPEC §8.8 wants ≥ 80.
- *Evidence:* [SEO_A11Y_TEST_RESULTS.md](SEO_A11Y_TEST_RESULTS.md) §3.
- *Effort:* 1 h.
- *Done when:* the map is usable within about 3 s on the phone, and a PageSpeed Insights run is recorded. If LCP stays above 2.5 s, evaluate dropping the map-chunk prefetch on slow connections (P2-5).

**P0-9 Screen-reader pass of the core journeys** [P1-7, raised] [H]
- *What:* VoiceOver (iOS Safari) and TalkBack (Android Chrome):
  - welcome → list → open a rent → report;
  - Filters, Stats;
  - Pin your rent with "Find my location";
  - a To-Let board from the list.
- *Why:* no screen-reader testing has ever been done. Without it the site can't claim WCAG 2.2 AA, and the list view is the only route to the data for blind users.
- *Evidence:* [ACCESSIBILITY_AUDIT_REPORT.md](ACCESSIBILITY_AUDIT_REPORT.md) §3.
- *Effort:* 2–3 h.
- *Done when:* each journey is completed by ear, issues are logged, and any blockers are fixed.

## P1: required for reliable operation

**P1-1 Decide the custom domain** [P1-8] [H]
- *Why:* it changes the canonical URLs, the sitemap, the CSP origin list, Supabase Auth redirects and the contact address. Search Console should be set up only after it.
- *Files:* `VITE_SITE_URL` (Netlify), `netlify.toml` (if the API origin changes), Supabase Auth settings.
- *Effort:* 1–2 h.
- *Done when:* the domain serves the site and `*.netlify.app` 301s to it.

**P1-2 Search Console and Bing Webmaster set up** (new) [H]
- *What:* the checklist in [SEO_AUDIT_REPORT.md](SEO_AUDIT_REPORT.md) §12.
- *Depends on:* P1-1.
- *Effort:* 1 h.
- *Done when:* the Domain property is verified, the sitemap is submitted, `/` and `/about.html` are inspected as "URL is on Google".

**P1-3 Cookie-free analytics + error visibility** [P1-2] [H]
- *What:* Cloudflare Web Analytics or Umami (SPEC §2). Optionally count, without personal data: rent submissions started vs completed, Turnstile failures, Map vs List usage, filter use, `?area=` landings.
- *Why:* there is currently no way to see failed submissions, JS errors or which localities people care about.
- *Files:* `index.html`, `netlify.toml` (CSP), `privacy.html` (disclosure).
- *Effort:* 3–5 h.
- *Done when:* page views and a "submit failed" count are visible, the CSP is updated, the Privacy page is updated, and no cookies are set.

**P1-4 Uptime monitoring** (new) [H]
- *What:* an external check (e.g. UptimeRobot free) on `/` and on a read of `public_stats_city`.
- *Why:* `keepalive.yml` only stops Supabase pausing. Nobody is alerted if Netlify or Supabase is down.
- *Effort:* 0.5 h.
- *Done when:* alerts reach the owner's phone or email.

**P1-5 Moderation and abuse process written down** (new) [H]
- *What:* who checks `admin.html`, how often, the target time to review a To-Let photo ("usually within a day" is promised in the UI), and what to do with a takedown request or illegal content.
- *Why:* the UI promises review; photos are public after approval.
- *Effort:* 1 h.
- *Done when:* there is a short runbook in the repo and a reminder or alert for pending items.

**P1-6 Rollback drill** [P1-9] [H]
- *What:* NETLIFY_DEPLOYMENT_CHECKLIST.md §8, once.
- *Effort:* 0.5 h.

**P1-7 Function handler tests and write-path E2E** [P1-5, P1-6]
- *What:* handler tests against `supabase start` (Docker) or a staging project; automate submit, edit, delete, report and upload.
- *Why:* writes are currently tested only by hand.
- *Effort:* 8–12 h.
- *Done when:* CI runs them on every push.

**P1-8 Incident response note** (new)
- *What:* one page covering the key-rotation steps (service role, Turnstile secret, DB password), how to take the site read-only (`VITE_` flags), and how to restore a backup.
- *Why:* there is a single maintainer; the steps exist only across several docs.
- *Effort:* 1–2 h.

**P1-9 Dependency updates** (new)
- *What:* `maplibre-gl` 6.16 → 6.18, `@supabase/supabase-js` 2.117 → 2.119 (minor versions); re-run `test:browser`.
- *Why:* staying current on the map engine and client. `npm audit --omit=dev` is currently clean.
- *Effort:* 1 h.

**P1-10 To-Let phone number only in the photo (WCAG 1.1.1)** (new, your decision)
- *What:* choose between (a) leaving it as a documented exception, or (b) letting moderators type the number as the image's text alternative during approval.
- *Why:* blind users can't get the number. Option (b) contradicts today's Privacy wording ("we never read or store the phone number") and needs a Privacy change.
- *Effort:* (a) 0 h; (b) 4–6 h incl. migration, admin UI and copy.

## P2: important improvements

| ID | Item | Why / evidence | Effort | Done when |
|---|---|---|---|---|
| P2-1 | **Locality and city SEO pages** [P2-2] via `scripts/build-localities.ts` (SPEC §12) | Only growth route from search. Gated: a locality page needs ≥ 5 rents and a BHK group with n ≥ 3; today 0 qualify. Plan in [SEO_AUDIT_REPORT.md](SEO_AUDIT_REPORT.md) §5. | 10–16 h | Pages build only for qualifying localities, are in the sitemap, and disappear when they drop below the gate. |
| P2-2 | Visible "What is this?" link on the map page after the welcome is dismissed | Users and crawlers see no explanation of the site once the dialog is gone | 1 h | A link to About in the legend or header |
| P2-3 | Cluster `~₹` label is an average [P2-3] | SPEC §5.10 "medians only" vs §8.3 | 1–3 h | Your decision recorded; label changed or justified |
| P2-4 | Glyphs served without compression | Lighthouse: about 70 KB saveable; `Content-Encoding` absent on `.pbf` | 1 h (test on a deploy preview) | `.pbf` served gzip/br, or a documented reason it can't be |
| P2-5 | Evaluate the map prefetch on slow connections | The 1.6 MB prefetch may compete with first paint on 3G/4G | 2 h | A decision based on P0-8 / RUM data |
| P2-6 | Copy-link fallback disappears after 8 s (WCAG 2.2.1) | `pin-card.ts`, `main.ts` show the URL in a timed toast when the clipboard fails | 1 h | The fallback stays until dismissed |
| P2-7 | Announce the filter result count; map empty-state panel (WCAG 4.1.3) | The count updates silently while filtering | 2 h | A polite, debounced "N rents shown" announcement, tested with a screen reader |
| P2-8 | Turnstile interactive challenge with assistive tech | Can't run on localhost | 0.5 h [H] | Checked during P0-9 |
| P2-9 | Database region (Frankfurt vs the Mumbai the spec assumed) | Latency for Indian users; legal relevance in P0-5 | Migration project | Your decision recorded |

## P3: optional

| ID | Item | Effort |
|---|---|---|
| P3-1 | `Organization` JSON-LD once the contact and domain exist (never a fabricated address) | 0.5 h |
| P3-2 | Unify the "Spot a To-Let" / "To-Let board" button labels (WCAG 3.2.4 consistency) | 0.5 h |
| P3-3 | Remove `'unsafe-inline'` from `style-src` [P3-4] | 2–3 h |
| P3-4 | zod 4 in functions; one locality-distance formula [P3-2/7] | 3–5 h |
| P3-5 | Keyboard pass at phone size with the bottom sheet open (WCAG 2.4.11) | 0.5 h |
| P3-6 | About's "Coming next" promises Phase 3 features that are deferred indefinitely: keep or remove | 0.1 h (your decision) |
| P3-7 | Netlify badge CSP console error [P1-3, decided "leave"] | — |

## By area

| Area | Open items |
|---|---|
| Product | P0-7 data, P1-10, P2-2, P2-3, P3-6 |
| SEO | P1-1, P1-2, P2-1, P2-2, P2-4, P3-1 |
| Accessibility | P0-1, P0-9, P1-10, P2-6, P2-7, P2-8, P3-2, P3-5 |
| Security | P0-2 (write paths), P0-3 (cron), P1-9, P3-3. **0 known code vulnerabilities**; RLS and grants proven (80 DB checks); no secrets in the build or history. |
| Backend | P0-3, P0-6, P1-7, P2-9 |
| Performance | P0-8, P2-4, P2-5 |
| Infrastructure | P1-1, P1-4, P1-6 |
| Privacy / legal | P0-4, P0-5, P1-10 |
| Analytics | P1-3 |
| Operations | P1-4, P1-5, P1-6, P1-8 |
| Documentation | P1-5, P1-8; this audit's five reports added; CHANGELOG updated |

## Already done (for context; verified in earlier reports or here)

- Backups restored successfully (12 Nov).
- Client-IP header confirmed.
- Phase 3 cron jobs off (0009).
- Map empty state.
- `WebSite` JSON-LD.
- CSP and HSTS live.
- RLS test in CI.
- **This audit:** board keyboard access, toast announcements, forced-colours focus, skip link, placement instructions, footer navigation, 404 page, sitemap `lastmod`, About accuracy, `<noscript>` content, glyph cache.
