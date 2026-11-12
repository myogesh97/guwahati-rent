# Guwahati Rent: Final Launch Checklist

Tick in order. Each line points to where the detail lives:
- **GAP:** [WEBSITE_LAUNCH_GAP_ANALYSIS.md](WEBSITE_LAUNCH_GAP_ANALYSIS.md)
- **NDC:** [NETLIFY_DEPLOYMENT_CHECKLIST.md](NETLIFY_DEPLOYMENT_CHECKLIST.md)
- **SPEC §17:** the original launch list

"Public launch" means the first public post (Reddit, WhatsApp groups, Facebook, media). A quiet invite-only beta can run before the whole list is done.

Status on 12 Nov 2026: ☐ open · ☑ done and verified · ◐ done in code, not deployed

## 1. Ship the current code

- ◐ Review and commit this audit's changes (a11y, SEO and cache fixes) and deploy them (GAP P0-1). Run first: `npm run typecheck && npm run lint && npm test && npm run test:deno && npm run test:db && npm run build && npm run test:browser`.
- ☐ After the deploy, confirm:
  - `curl -sI https://<site>/map-assets/sprites/light.json` shows `max-age=86400`;
  - `https://<site>/nope` shows the branded 404 with status 404;
  - `/sitemap.xml` has 4 URLs and no `lastmod`.
- ☑ Migrations 0001–0009 applied; 8 Edge Functions deployed (12 Nov).

## 2. Security and backend (verify on production)

- ☐ Smoke-test every write path on a real phone: submit, edit, delete, report, To-Let upload, admin approve and reject (GAP P0-2, NDC §7). Remove the test data afterwards.
- ☐ Full `npm run security-check` against production (SPEC §17).
- ☐ Cron jobs succeeding: `cleanup`, `flag-outliers`, `tolet-maintenance` (GAP P0-3).
- ☑ Backups run, and one was restored successfully (12 Nov).
- ☑ Client-IP header confirmed (`cf-connecting-ip`).
- ☑ No service-role key in `dist/` or git history; `.env` never committed (re-checked 12 Nov).
- ☑ `npm audit --omit=dev` = 0 vulnerabilities (re-checked 12 Nov).
- ☐ Admin user exists in `admins`; Supabase Auth redirect URLs include the final domain.

## 3. Legal, privacy and trust

- ☐ Contact email added to the Privacy page and monitored (GAP P0-4).
- ☐ Privacy and Terms reviewed under the DPDP Act 2023. Retention, backups, the Frankfurt region, the grievance contact and takedown all need wording (GAP P0-5).
- ☐ Moderation routine written down: who reviews To-Let photos and reported pins, and how often (GAP P1-5).
- ☑ Privacy page reachable from every page and from the rent form (footer + form link, in this change).
- ☑ Disclaimers in place: rents unverified, conditions are one renter's report, waterlogging is not official flood data, "never pay before seeing the flat".

## 4. Data (the real blocker)

- ☐ Locality centres checked by someone local; `public/localities.json` = `_shared/localities.ts`; `submit-pin` redeployed (GAP P0-6).
- ☐ **150+ real rents across 15+ localities** (today: 9 in 6) (GAP P0-7, SPEC §17).
- ☐ Survey import dry-run reviewed before the real import.

## 5. Accessibility

- ◐ Board keyboard access, toast announcements, forced-colours focus, skip link, placement instructions (deployed with §1).
- ☐ VoiceOver (iOS) and TalkBack (Android) pass of the core journeys (GAP P0-9).
- ☐ Your decision on the To-Let phone number text alternative (GAP P1-10).
- ☑ axe 0 violations in all 18 scans (6 static pages, 12 states of the map app); keyboard journeys scripted; reflow at 320 px and 200 %.

## 6. Performance

- ☐ Lighthouse mobile on the live URL recorded, aiming for Performance ≥ 80 and Accessibility ≥ 95 (SPEC §17). Lab today: 55 simulated, 81–93 with applied throttling; Accessibility 100.
- ☐ Tested on a budget Android over 4G: map usable in about 3 s; pins, filters and list feel instant (GAP P0-8).

## 7. Domain and search (can follow a soft launch, but before any SEO push)

- ☐ Custom domain decided and live; `VITE_SITE_URL` set; `*.netlify.app` redirects (GAP P1-1).
- ☐ Google Search Console Domain property verified; sitemap submitted; `/` inspected (GAP P1-2).
- ☐ Bing Webmaster Tools: import from GSC.
- ☐ WhatsApp preview checked on a phone (OG image and text).
- ☐ No Google Business Profile: the site has no physical location.

## 8. Operations

- ☐ Uptime alert on the site and on one read of the public API (GAP P1-4).
- ☐ Cookie-free analytics and failed-submission counting, disclosed on the Privacy page (GAP P1-3).
- ☐ Rollback drill done once (GAP P1-6, NDC §8).
- ☐ One-page incident note: key rotation, read-only mode, restore (GAP P1-8).
- ☑ Weekly backup, keep-alive, nightly rebuild and CI (with the DB test) running.

## 9. Launch day

- ☐ Posts ready (SPEC §17): r/guwahati, college and hostel WhatsApp groups, local Facebook groups, local media. The hook is the monsoon waterlogging map.
- ☐ Watch the first 48 h: analytics, function logs (Supabase dashboard), the admin queue, the contact inbox.

## Safe to do after launch

Locality and city SEO pages once the data gate is met (GAP P2-1); filter-count announcements (P2-7); glyph compression (P2-4); prefetch tuning (P2-5); cluster-label median (P2-3); dependency bumps (P1-9); function handler tests (P1-7); P3 items.
