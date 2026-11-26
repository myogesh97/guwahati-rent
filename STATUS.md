# Guwahati Rent: Project Status (wrap-up)

**As of 26 Nov 2026.** The latest audit (release verdict, open items, owner actions) is in [docs/wrap/](docs/wrap/WRAP_REPORT.md). This file is the single current source of truth. Where any other doc disagrees about *status*, this file wins.
SPEC.md, NEXT-PHASES.md and PHASE-2C.md still describe *how* the system works. The dated audit reports are historical snapshots.

## Decision: the project is wrapped

No further phases are planned.
- **Phase 3** (owner listings, seeker matching, email digests) and **Phase 4** (locality SEO pages, Rent Index) are **cancelled**, not deferred.
- The site stays live on `https://guwahati-rent.netlify.app` (Netlify subdomain; no custom domain) in maintenance mode.
- Remaining work is the final changes listed below plus a wrap-up pass (to be specified separately).

## What is live

| Part | State | Verified |
|---|---|---|
| Frontend | `main` on Netlify (Phases 0, 1, 2a, 2, 2c.1; robots.txt, sitemap.xml, branded 404, consent checkboxes, no cluster averages) | 26 Nov, live site |
| Database | Supabase `ngssgjuagrlyhsvtiwhk`, South Asia (Mumbai). Migrations 0001–0010 applied | 26 Nov: `public_pins` exposes the 0010 column `sqft_band` |
| Edge Functions | All 8 active. The 2c.2 versions are deployed | 26 Nov: `submit-pin`, `submit-tolet`, `report-pin` return 400 `consent` without consent. `submit-pin` rejects a phone number and a flat number in `society_name` before Turnstile. No rows were written by these probes. |
| Old project | Frankfurt `apgdczuofczobxaggsfy` paused or deleted | Owner-reported |
| Backups | GitHub Actions secrets point to Mumbai; `weekly-backup` green | Owner-reported |
| Secrets | CRON_SECRET rotated in Edge Function secrets and Vault | Owner-reported |
| Demo showcase | Built, opt-in (`VITE_DEMO_SHOWCASE`), **off** in production | 26 Nov: no DEMO banner on the live site |
| Release tag | `v0.5.0` (26 Nov) covers 2c and the showcase | `git tag` |

## Launch checklist at wrap-up

| ID | Item | State |
|---|---|---|
| P0-1 | DB backups | Done (owner-reported for Mumbai) |
| P0-2 | Phone smoke test of every write path | Done (owner-reported 26 Nov) |
| P0-3 | Client-IP header | Done (12 Nov) |
| P0-4 | Cron + Vault: `tolet-maintenance` runs and gets HTTP 200 | **Open**: run the SQL in "Final checks" below |
| P0-5 | Privacy contact + DPDP review | Copy fixed; legal review not done (accepted for a wrapped side project) |
| P0-6 | 30 locality centres checked against real places | **Open** |
| P0-7 | 150+ real pins in 15+ localities | **Open.** Owner reported done, but later on 26 Nov `public_pins` returned **0** rows (the 15 Nov Basistha test pin was deleted). Tracked as P0 PW-02 in [docs/wrap/PENDING.md](docs/wrap/PENDING.md). |
| P0-8 | Lighthouse mobile + budget Android over 4G | **Open** |
| P1-2 | Analytics | Won't do |
| P1-7 | Screen-reader pass | Open (optional) |
| P1-8 | Custom domain | Decided: stay on the Netlify subdomain |
| P1-9 | Rollback drill | Open (optional) |
| P3 | zod 4, dependency bumps, drop `unsafe-inline` styles | Won't do unless a security fix needs it |

## Final checks (owner)

1. **Pins.** In the Supabase SQL editor:
   ```sql
   select status, source, count(*) from pins group by 1,2 order by 1,2;
   select count(distinct locality_slug) from pins where status = 'active';
   ```
   - The public map shows only `status = 'active'`.
   - If imported pins are not `active`, or were imported into a different project, they are not visible.
   - If the 15 Nov Basistha pin (₹12,333) is a test pin, delete it.
2. **Cron.**
   ```sql
   select j.jobname, d.status, d.return_message, d.start_time
   from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   order by d.start_time desc limit 10;
   select status_code, created from net._http_response order by created desc limit 5;
   ```
   Expect `succeeded` and `200`. A `401` means the CRON_SECRET in Vault and in the function secrets differ.
3. **Locality centres:** see `public/localities.json` (30 entries). Must stay identical to `supabase/functions/_shared/localities.ts`; a test enforces this.
4. **Lighthouse:** Chrome DevTools → Lighthouse → Mobile → Performance, Accessibility, Best practices, SEO on the live URL. Plus one real low-cost Android phone on mobile data.
