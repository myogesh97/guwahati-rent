# Phase 2c: Launch hardening and lessons from bengaluru.rent

Status: NEW (15 Nov 2026). This file sits between NEXT-PHASES.md Phase 2 (live) and the launch.
It does not override SPEC.md section 5 (Security rules) or NEXT-PHASES.md section 5 ("Not now").
If anything here conflicts with those, they win. Stop and tell the owner.

## 0. Instructions for the AI coding agent (read first)

1. Read CLAUDE.md, then SPEC.md section 0 and section 5, then NEXT-PHASES.md sections 0, 1, 1b and 5, then this file.
2. Work in two stops: **2c.1 (frontend and copy, no migration)** then **2c.2 (migration 0010 and Edge Functions)**.
   Finish 2c.1, run every check, write the report (section 6), and STOP. Do not start 2c.2 until the owner says "go 2c.2".
3. No new dependencies (npm or Deno) without asking first. Use what is already in package.json.
4. Never edit an applied migration (0001 to 0009), not even a comment. New SQL goes in `0010_*.sql` only.
5. Never loosen RLS, grants or the anon key's reach. The anon key never reads email, phone, IP hashes, report messages or edit-token hashes.
6. No fake or demo data in production builds. Demo mode stays dev-only and labelled.
7. Every number shown to users comes from the database at run time, never typed into HTML or copy.
8. Before reporting, run:
   `npm run typecheck && npm run lint && npm test && npm run test:deno && npm run test:db && npm run build && npm run test:browser`
   Every one must pass. If one cannot run (for example no local database), say so in the report. Do not claim it passed.
9. Mark every step that needs the owner with **[HUMAN]**, and give the exact command or click path.

## 1. Why this phase exists

On 15 Nov 2026 we tore down bengaluru.rent, the site we are replicating. Its main failures:
- Three different answers for the same rent: averages in the app, medians on the web.
- A leaderboard of junk rents.
- 68% of its listings were stale.
- Required society names, plus a flat number and a phone number shown in public text.
- "By moving forward you agree" consent.
- No CAPTCHA.
- No dialog semantics.
- A personal message board on the map.

A code check of this repo found that we repeat four of these:

| # | Where | Problem |
|---|---|---|
| F1 | `src/layers.ts` (layer `cluster-avg`) | Cluster bubbles show `~₹Xk` = rentSum / point_count, a **mean**. This breaks the CLAUDE.md rule "medians not averages", even as a "visual hint". |
| F2 | `src/ui/pin-card.ts` line ~189 and the public pin detail data | `society_name` is shown on the public pin card. Combined with 3dp coordinates, BHK, deposit and sq ft, it can identify a single flat. The free text is not checked for flat numbers, phone numbers or emails. |
| F3 | `index.html` line ~337 | "By continuing you agree to our Privacy Policy and Terms". This is implied consent, a weak pattern under India's DPDP Act 2023. |
| F4 | `public/` | No `robots.txt`, no `sitemap.xml`. |

The doc copies of the old Supabase ref/region (apgdczuofczobxaggsfy, Frankfurt) are also out of date.

## 2. Phase 2c.1: frontend, copy and SEO basics (NO migration)

### 2c.1-A Medians only (fixes F1)
- Remove the `cluster-avg` layer and the `rentSum` cluster property. Clusters show the count only.
- Do NOT replace it with a min–max range. Min and max are the values most distorted by junk pins (one ₹1,50,000 pin makes the range useless).
- Tapping a cluster opens a small popup.
  - Use `getClusterLeaves(clusterId, Infinity)` on the GeoJSON source, drop pins where `is_outlier` is true, and compute the median in `src/format.ts`. Write it as a pure function with unit tests: odd, even and empty inputs.
  - Show it as "Median ₹12,000 · 14 rents" and give the popup a "Zoom in" button.
  - Below 3 non-outlier rents, show "Not enough rents yet · Zoom in".
  - Mixed BHKs make a median misleading. Show the median per BHK when the cluster has 3 or more of that BHK, otherwise show "mixed sizes".
  - Keyboard and screen reader: the existing list view must expose the same numbers.
- Grep `src/`, `index.html`, `about.html`, `privacy.html`, `terms.html` and `public/` for `average|avg|mean`, case-insensitive.
  - Every user-facing figure must be a median, and must show its sample size and time window, for example: "Median ₹12,000 · 14 rents · last 18 months".
  - Below 3 rents, show "Not enough rents yet" instead of a number.
- Add a unit test that fails if a built HTML or JS string shown to users contains "average", or a test of the cluster layer config with no `rentSum`.

### 2c.1-B Pin card clarity
- Rent pins: add one line under the rent: "This is what a tenant pays. It is not a listing." Add a link "See To-Let boards nearby" that turns on the To-Let layer and zooms to the pin.
- Outlier note: change the copy to "Unusual compared with nearby rents. Not counted in medians."
  - This must be true. Add a `test:db` assertion that `is_outlier = true` pins are excluded from every `public_stats_*` view (0001 already filters; prove it with a test).
- Society name: in 2c.1, do NOT show `society_name` on the public card at all. It comes back in 2c.2 only behind the k-anonymity rule (fixes F2 part 1).

### 2c.1-C Explicit consent (fixes F3)
- Remove "By continuing you agree…" from the welcome screen. The welcome screen must never block the map. It can be dismissed and does not ask for agreement.
- On every submit form (rent pin, To-Let, report), add a required, unticked checkbox before submit:
  "I agree to the [Privacy Policy] and [Terms]. My rent is shared anonymously."
- The submit button stays disabled until the box is ticked.
- The Edge Functions must reject a submission without `consent: true`.
  - That is a server change, so do it in 2c.2.
  - In 2c.1, send the field from the client.
- Proper labels, `aria-describedby` for the links, and a keyboard test in `test:browser`.

### 2c.1-D Share loop (WhatsApp, no SDK)
- After a successful rent pin, show a success toast or dialog with a "Share on WhatsApp" button.
  - Link: `https://wa.me/?text=<encoded>`.
  - Text: "I just added my rent anonymously to Guwahati Rent. See what people really pay: <VITE_SITE_URL>".
  - No tracking parameters with personal data.
- Add the same button to the About page.
- CSP: wa.me is a link (navigation), so no CSP change should be needed. Confirm this.

### 2c.1-E Honest live counts
- Add a small strip on the welcome screen and the About page, for example: "<N> rents · <M> localities · updated <date>", from the existing public stats views.
- Hide the strip completely while N < 50. No inflated, annualised or "+" numbers. Never show a sum of rents.
- The meta description and OG text must not contain counts. They are static, and counts in them go stale.

### 2c.1-F SEO basics (fixes F4). Locality pages stay deferred (Phase 4).
- `public/robots.txt`: allow all, point to the sitemap, disallow `/admin.html` and `/unsubscribe.html`.
- `public/sitemap.xml`: `/`, `/about.html`, `/privacy.html`, `/terms.html`, using `VITE_SITE_URL` at build time. Generate it in a small Vite plugin or build script with no new dependency. Do not hand-type the domain.
- `about.html`: add FAQPage JSON-LD with 5–6 true answers (how it works, is it anonymous, is it free, how outliers are handled, how to delete my pin, who runs it). The answers must match privacy.html word for word on facts (retention, rounding, report threshold).
- Confirm `404.html` links back to the map and is served by Netlify for unknown paths. Check the `netlify.toml` redirects.

### 2c.1-G Consistency guard
- Put every number that appears in policy or copy in `src/config.ts` and use it from there: rounding (3dp / ~110 m, boards 4dp), report threshold (3), expiry (60 days), stats window (18 months), minimum sample (3).
- privacy.html and terms.html must say the same numbers. Add a test that greps the built HTML for these values and fails on drift.

### 2c.1-H Docs refresh (no code)
- Replace the old project ref `apgdczuofczobxaggsfy` and "Frankfurt" with `ngssgjuagrlyhsvtiwhk` / "South Asia (Mumbai)" in: README.md, NEXT-PHASES.md, FINAL_LAUNCH_CHECKLIST.md, PRODUCTION_READINESS_REPORT.md and WEBSITE_LAUNCH_GAP_ANALYSIS.md.
- MIGRATE-REGION.md: add a line at the top: "Completed 15 Nov 2026; data copy skipped (dummy data)".
- Do NOT touch `supabase/migrations/0005_tolet_cron.sql`, because it is applied.
- Update CLAUDE.md's status line to mention Phase 2c.

**Then STOP and report (section 6).**

## 3. Phase 2c.2: migration 0010 and Edge Functions (only after "go 2c.2")

### 2c.2-A PII filter on all public free text (fixes F2 part 2)
- Create `supabase/functions/_shared/pii.ts` with `scrubPublicText(s)` and Deno tests. It rejects (400, with a field-level message) or strips:
  - Indian phone numbers: 10 digits, optional +91/0 prefix, with spaces or dashes in between
  - Email addresses
  - URLs
  - Flat or unit tokens: `\b(flat|unit|apt|apartment|house|h\.?no|door)\s*#?\s*[A-Z]?-?\d+`, a standalone `[A-Z]-?\d{2,4}` or `\d{3,4}`, and "Tower X 1203"-style patterns
- Apply it in `submit-pin` and `edit-pin` (society_name), and in `submit-tolet` (any public message or name field).
- Report messages stay private and are not scrubbed. They are already hidden from anon.
- Test cases must include: "701 Avalon Heights", "Flat A-302, Green Valley", "call 98xxxxxxxx", "Sunrise Apartments" (allowed).

### 2c.2-B k-anonymity for society names, in migration `0010_privacy_k_anon.sql`
- Add a normalised column, or compute it in a view: lower-case, trimmed, with the words apartment/apartments/residency/enclave removed.
- The public views show `society_name` ONLY when at least 3 active, non-outlier pins share the same normalised name within 300 m (PostGIS `ST_DWithin` on geography). Otherwise it is NULL.
- Same rule for `sqft`: return it bucketed (<500, 500–800, 800–1200, 1200+), never exact. This only affects public views. The base table keeps the exact value.
- Do not change grants. Views keep `security_invoker`/owner as set in 0001–0009. Show the full SQL to the owner before `db push`.
- Add `test:db` cases:
  - 2 pins with the same society → NULL
  - 3 pins → shown
  - 3 pins but 1 km apart → NULL

### 2c.2-C Server-side consent
- `submit-pin`, `submit-tolet` and `report-pin` / `report-tolet` require `consent === true`, using zod or the existing validator. Store `consented_at timestamptz` on the row (migration 0010, nullable for old rows).
- Return 400 with `{ field: 'consent' }` when it is missing. Add Deno tests.

### 2c.2-D Freshness signal for To-Let boards
- Boards older than 45 days show a "Spotted 45+ days ago, may be gone" badge on the card. Expiry stays at 60 days (NEXT-PHASES §1b).
- Admin page: add a count of "boards expiring in the next 7 days".
- No emails: they are deferred until Phase 3 (custom domain + Resend).

### 2c.2-E Security gate
Extend `scripts/security-check.sh`:
- The anon key cannot read `society_name` for a pin whose group has fewer than 3 pins.
- The anon key cannot read exact `sqft`.
- A submit without `consent` returns 400.
- A society name containing a phone number returns 400.

**[HUMAN] steps for 2c.2** (the agent writes them out in full in the report):
1. Review `0010_privacy_k_anon.sql`, then run `npx supabase db push`.
2. `npx supabase functions deploy submit-pin edit-pin submit-tolet report-pin report-tolet`
3. Run the security check against the Mumbai project, with env vars set explicitly (not `.env`):
   `SUPABASE_URL=https://ngssgjuagrlyhsvtiwhk.supabase.co SUPABASE_ANON_KEY=<publishable> npm run security-check`
4. Push to main so Netlify ships the frontend. Smoke-test on a phone: pin, then consent, then share, then the card shows no society.

**Then STOP and report.**

## 4. Explicitly NOT in this phase (do not build)
Seeker matching, owner listings, phone/email collection, "watch this area" alerts, comments, ratings, leaderboards of rents or spotters, My Vibe or livability grids, green cover, satellite, a maker message board, AdSense, programmatic locality pages (Phase 4, after ~300 real pins), scraping of any site, and fake or "seed" pins presented as real.

## 5. Acceptance (owner checks on a real phone after 2c.2)
- [ ] No "~₹" average appears anywhere on the map. Clusters show a count, and tapping one shows the median per BHK with n.
- [ ] Every rent figure on the site says median, n and the time window.
- [ ] A single pin with a society name does not show the name. After 3 pins in the same society, it shows.
- [ ] Submitting "Flat 302, Sunrise Apartments" or a phone number in the society field is rejected with a clear message.
- [ ] Forms cannot be submitted without ticking consent, and the server rejects a crafted request without it.
- [ ] WhatsApp share opens with the correct text and the live URL.
- [ ] /robots.txt and /sitemap.xml load on the live site. /nonsense shows the branded 404 page with a link home.
- [ ] Privacy, Terms, About and FAQ JSON-LD state the same numbers as `src/config.ts`.
- [ ] `npm run security-check` passes against Mumbai.

## 6. Report format (after each stop)
1. What changed: file → one line each.
2. Commands run and their pass/fail output (last lines).
3. Anything skipped or not verifiable, and why.
4. [HUMAN] steps, numbered, with exact commands.
5. Risks or open questions for the owner. Keep this to at most 5 bullets.
