# Guwahati Rent: SEO Audit Report

**Date:** 12 Nov 2026 · **Baseline:** `c78d677` on `main` (= `origin/main`; live site = tag `v0.4.0`) · **Live URL:** https://guwahati-rent.netlify.app (no custom domain yet)
**Companion files:** [ACCESSIBILITY_AUDIT_REPORT.md](ACCESSIBILITY_AUDIT_REPORT.md) · [SEO_A11Y_TEST_RESULTS.md](SEO_A11Y_TEST_RESULTS.md) (every command and result) · [WEBSITE_LAUNCH_GAP_ANALYSIS.md](WEBSITE_LAUNCH_GAP_ANALYSIS.md) · [FINAL_LAUNCH_CHECKLIST.md](FINAL_LAUNCH_CHECKLIST.md)

## Overall assessment: **NEEDS WORK**

- **Technical SEO is sound.** HTTPS is forced, robots.txt and sitemap.xml are valid and correct, every indexable page has a unique title, description and canonical URL, the private pages are `noindex`, and Open Graph/Twitter cards and `WebSite` JSON-LD are in place. Lighthouse SEO scores 100 on all three pages tested. That score only means the basics exist.
- **What limits discovery is content, not code.** Only 4 URLs are indexable: the map, About, Privacy and Terms. Everything that makes the site useful (rents, medians, waterlogging) is loaded by JavaScript from the database and has no crawlable URL. Nobody searching "2 BHK rent in Beltola" can land here today.
- **The fix is static pages, generated at build time, and they depend on data.** SPEC §12 already plans locality pages through a build script. **No locality qualifies yet.** There are 9 rents in 6 localities, and the spec's rule (≥ 5 rents, including one bedroom group with ≥ 3) is met by none. Creating those pages now would produce thin pages, which the spec rightly forbids.
- **Nothing has been submitted to a search engine.** There is no Search Console or Bing property, and the domain is undecided. Choose the domain before submitting anything (see §12).

---

## 1. Crawlability and indexing

Checked with `curl` against production and in the local production build.

| Check | Result | Evidence |
|---|---|---|
| robots.txt | **PASS** | 200, `text/plain`. `Allow: /`, disallows `/admin.html` and `/unsubscribe.html`, points to the sitemap. Generated at build (`vite.config.ts`). |
| sitemap.xml | **PASS** (improved) | 200, `application/xml`, valid XML, 4 canonical URLs, no private pages. **Fixed:** removed `<lastmod>`. The nightly rebuild stamped every page "changed today", and search engines learn to ignore a lastmod that is always new. |
| Accidental `noindex` | **PASS** | Only `admin.html`, `unsubscribe.html` and the new `404.html` carry `noindex`, all on purpose. No `X-Robots-Tag` header on production. |
| HTTPS | **PASS** | `http://` returns 301 to `https://`. HSTS `max-age=31536000; includeSubDomains; preload`. |
| Status codes | **PASS** (improved) | Real pages return 200; unknown paths return 404. **Fixed:** before this change the 404 was Netlify's generic page with no links back. A branded `404.html` (noindex, links to the map and info pages) is now built; Netlify serves it automatically with status 404. |
| Soft 404s | **PASS** | `/beltola/` and `/does-not-exist` return a real 404, not 200. |
| Duplicate URL variants | **PARTIAL** | Netlify serves `/about` and `/about.html` (both 200), and `/index.html` alongside `/`. Every page's `rel=canonical` names the `.html` (or `/`) form, so search engines consolidate them. A redirect isn't needed. `/about/` redirects 301 to `/about`. |
| Query parameters | **PASS** | `/?bhk=2`, `?view=list`, `?pin=…`, `?area=…` all canonicalise to `/`. Filter URLs are for sharing, not for indexing. |
| Demo URLs | **PASS** | `?demo=` exists only in `npm run dev` and is stripped from production builds (verified by the browser smoke test: `?demo=max` is ignored in production). |
| Staging / deploy previews | **NOT VERIFIED** | Netlify normally adds `X-Robots-Tag: noindex` to deploy previews and branch deploys. No preview URL was available to confirm it. |
| Internal discoverability | **PASS** (improved) | **Fixed:** Privacy and Terms used to be linked only from the one-time welcome dialog, and About linked nowhere. About, Privacy, Terms and 404 now share a footer (Rent map · About · Privacy · Terms), the rent form links to the Privacy Policy, and the no-JavaScript fallback links all three. |
| Broken internal links | **PASS** | Every `href` on every page resolves (listed in the test results). |

## 2. HTML metadata

| Page | Title | Description | Canonical | OG / Twitter | Robots |
|---|---|---|---|---|---|
| `/` | Guwahati Rent — real rents, pinned by real renters | Yes, unique | `/` | Full set (image 1200×630, alt, dims) | indexable |
| `/about.html` | About · Guwahati Rent | Yes, unique | self | OG + `summary_large_image` | indexable |
| `/privacy.html` | Privacy · Guwahati Rent | Yes, unique | self | OG + card | indexable |
| `/terms.html` | Terms · Guwahati Rent | Yes, unique | self | OG + card | indexable |
| `/admin.html`, `/unsubscribe.html`, `/404.html` | unique | none (fine for noindex) | none | none | `noindex` |

- `lang="en"`, `charset=UTF-8` and `viewport` are on every page. `theme-color` is set on the map page. The favicon is an SVG.
- **Metadata accuracy:** the descriptions mention only features that exist (rents, monsoon waterlogging, water, power; no login; no brokers). The About page has a "Coming next" section about owner listings and seeker matching, which are SPEC Phase 3, deferred. It is labelled as future, but **you decide** whether to keep promising it (gap analysis P3-6).
- The document title doesn't change with filters or a selected pin. That's correct here: none of those states has its own indexable URL.

## 3. Semantic HTML and content structure

- **Map page:** one `<h1>` (visually hidden: "Guwahati Rent: real rents, pinned by real renters"), with `header`, `nav`, `main` and native `dialog`s, each titled by an `<h2>` and sectioned with `<h3>`. The list view is a real `<table>` with `<caption>`, `scope="col"` and `aria-sort`.
- **Static pages:** a single `<h1>` and a flat `<h2>` hierarchy. Now with `<footer><nav>`.
- **Link text** is descriptive everywhere ("Privacy Policy", "Open the rent map", "Share on WhatsApp"). The only icon-only buttons are ✕ closes, and they carry `aria-label`.
- **Without the map:** the welcome dialog, the forms and the hidden `<h1>` are in the HTML. The rents themselves are not.

## 4. JavaScript SEO and SPA limitations

| Question | Answer |
|---|---|
| Meaningful content in the initial HTML? | Header, the hidden `<h1>`, the toolbar labels, the legend and the dialog copy (welcome, form questions). **No rents, medians or localities.** |
| Content inserted only by JS? | All rent data, the list view, stats and pin details (from Supabase views at runtime). |
| Can search engines discover rental information? | **No.** Google can render JS, but there are no per-locality URLs, and the data sits behind a cross-origin API call made at runtime. |
| If JavaScript fails? | **Improved:** the `<noscript>` block now describes the site and links About/Privacy/Terms, instead of only "needs JavaScript". |
| Routing / refresh / nested routes | There are no client-side routes. State lives in query parameters on `/`. Refresh restores filters, view and monsoon layer. Netlify needs no SPA rewrite, and none is configured, so unknown paths correctly 404. |
| Social crawlers | Read static OG tags in the HTML, which is correct. A shared `?pin=` link previews the generic card (by design: no per-pin pages, for privacy). |

**Is the SPA architecture limiting SEO?** Yes, for data-driven queries. It is not a reason to change frameworks. Informational content already lives in multi-page static HTML (Vite MPA). The missing piece is **build-time generation of static data pages**, which SPEC §12 describes and the nightly rebuild workflow is already set up to refresh.

**Recommended approach (no new framework, no SSR):** a `scripts/build-localities.ts` that runs after `vite build`, reads the public views with the anon key, writes plain HTML into `dist/<slug>/index.html` (same `page.css`, real medians in the text and meta description), and appends those URLs to the sitemap. The nightly GitHub Action rebuild keeps the numbers fresh. Pages are created only when a locality passes the data gate, and they disappear from the sitemap if it drops below.

## 5. URL structure and page strategy

Only pages that can carry distinct, real information. **None of the data pages should be built until its gate is met.**

| URL | Search intent | Unique content requirement | Internal links | Index? | Render | Status today |
|---|---|---|---|---|---|---|
| `/` | "guwahati rent map", brand | The map itself; a short visible intro would help (P2) | → About, Pin your rent | Yes | Static shell + JS | Live |
| `/about.html` | "how is this data collected" | Method, limits, who it's for | ↔ footer | Yes | Static | Live (content improved here) |
| `/rent-in-guwahati/` | "rent in guwahati", "average rent guwahati" | City medians by BHK (n ≥ 3, 18 months), pin count, % reporting waterlogging, updated date | → locality pages, map | Yes, **once** ≥ 3 BHK groups have n ≥ 3 | Build-time static | **Not built** (`public_stats_city` has 1 group today: 2 BHK flat, not gated, n = 5) |
| `/<locality-slug>/` (e.g. `/beltola/`) | "2 bhk rent beltola" | Medians by BHK, pin count, water/monsoon summary, 4 nearest localities, "Open on map" → `/?area=<slug>` | → nearby localities, city page, map | Yes, **only if** ≥ 5 rents and one BHK group n ≥ 3 | Build-time static | **0 qualify** (Lalganesh has 4 rents) |
| `/pg-in-guwahati/` | "pg in guwahati" | PG medians, meals/gender split, localities with PGs | → map `?type=pg` | Only with ≥ 10 PG rents | Build-time static | **Not built** (0 PG rents) |
| `/1rk-rent-guwahati/` | "1rk in guwahati" | 1RK medians and spread | → map | Only with ≥ 10 1RK rents | Build-time static | **Not built** (1 1RK rent) |
| `/monsoon-waterlogging-guwahati/` | "waterlogging areas guwahati" | Renter-reported waterlogging by locality, with a clear "not official flood data" caveat | → localities, map `?water=1` | Only with enough answered reports across ≥ 10 localities | Build-time static | **Not built** |
| Per-pin pages | — | — | — | **Never**: thin and a privacy risk | — | — |
| Filter URLs (`?bhk=2`…) | — | — | — | No (canonical `/`) | — | Correct |

Don't create a page for an empty category, and never index a page whose numbers come from fewer than 3 rents.

## 6. Structured data

- **Present:** `WebSite` JSON-LD on `/` (name, URL, description, `inLanguage: en-IN`). It parses as valid JSON, matches visible content, and describes the site, never individual rents. It isn't executable, so the CSP allows it.
- **Not added, on purpose:**
  - `Organization`: there is no contact, address or logo URL yet. Add one when the domain and contact exist (P3).
  - `RealEstateAgent`, `Residence`, `Offer` or `AggregateRating`: these would misrepresent the site. It is not a broker, has no listings, and has no reviews.
  - `BreadcrumbList`: there is nothing to nest until locality pages exist.
- **Later, on locality pages:** `BreadcrumbList` (Home › Locality) and `WebPage`. Don't put rents in `Offer` markup; they are reported payments, not prices for sale.
- **Rich Results Test:** NOT RUN (no Google access in this session). `WebSite` alone yields no rich result; the test only confirms validity.

## 7. Images and media

| Item | Status |
|---|---|
| `og-default.png` | 1200×630 PNG, 72 KB, declared with dimensions and alt (map page). |
| Inline SVG icons | `aria-hidden="true"`, decorative. |
| To-Let photo | `alt="Photo of a To-Let board"`, loaded on demand (never on first paint). It isn't indexable: it sits behind a JS dialog. User photos are moderated before publication, cannot become SEO content, and expire after 60 days. |
| Map assets | Canvas-rendered. No `<img>`, no LCP image. |
| Lazy loading / `fetchpriority` | Not applicable. The page has no above-the-fold `<img>`; the LCP element is text. |

## 8. Internal linking and content quality

- **Before:** the map page linked only About. About linked nothing. Privacy and Terms appeared only in a dialog shown once per browser.
- **After (this change):** footer navigation on every static page, a Privacy link at the point of data entry (rent form), and links in the no-JS fallback. No orphan pages remain.
- **Homepage explanation** (does it say what this is, for whom, how data is collected, how to contribute, the limits?):
  - The **welcome dialog** covers what it is and how to contribute.
  - **About** now covers who it's for, how it works (with the real placement flow; the old copy described "tap where your home is"), that PG/1RK/rooms are supported, the optional water, power and monsoon questions, the list alternative, and the limits: self-reported, unverified, rents over 18 months hidden, medians need ≥ 3 rents, conditions describe one home and are not official data.
  - Every added sentence was checked against the code (`src/filters.ts` 18-month default; `src/ui/stats.ts` n ≥ 3; the form's property types). No unverifiable claims were added.
- **Remaining:** the map page shows no visible intro once the welcome is dismissed. A one-line "What is this?" link to About in the legend or header would help users and crawlers (P2, design decision).

## 9. Local SEO

- **Brand:** "Guwahati Rent" is used consistently in titles, OG site_name, JSON-LD and copy.
- **Location signals:** "Guwahati" appears in every title and description. Locality names in `public/localities.json` use common English spellings (Beltola, Ganeshguri, Lachit Nagar…). These must be checked for spelling and position by someone local (existing P0-6).
- **Google Business Profile: not appropriate.** GBP is for businesses that meet customers in person at an address, or serve them at their locations. Guwahati Rent is online-only, with no office, phone or staff contact. Don't create a profile, and never invent an address or phone number.
- **What will work locally:** the locality pages in §5, plus the planned WhatsApp, Reddit and Facebook sharing (SPEC §17). Shared links carry the OG card.

## 10. Internationalisation and language

- `lang="en"` everywhere; `inLanguage: en-IN` in JSON-LD. Content is English. **No hreflang**: there is no other language version, and none should be added until one exists.
- Rupees use the Indian grouping (`toLocaleString('en-IN')` → ₹1,50,000). Dates use `en-IN`.
- The font stacks include `Noto Sans Bengali`, so Assamese script renders if a renter types it in a free-text field. Map labels are requested in English (`lang: 'en'`).

## 11. Core Web Vitals and performance (lab only)

Full numbers are in [SEO_A11Y_TEST_RESULTS.md](SEO_A11Y_TEST_RESULTS.md) §3. **There is no field data** (no CrUX, no RUM), so Core Web Vitals are **NOT VERIFIED**.

| Metric (map page, mobile) | Target | Lighthouse simulated throttling (live) | Lighthouse **applied** throttling (live, 2 runs) | Verdict |
|---|---|---|---|---|
| LCP | ≤ 2.5 s | 4.0 s | 2.2 s / 3.3 s | **Borderline**; field data needed |
| CLS | ≤ 0.1 | 0.025 | 0.025 | PASS (lab) |
| TBT (lab proxy for INP) | — | 2,120 ms | 70–80 ms | Simulated value inflated (see below) |
| FCP | — | 1.8 s | 2.0 s / 3.0 s | — |
| Performance score | ≥ 80 (SPEC §8.8) | **55** | **93 / 81** | Depends on the method; not verified on a phone |
| About / Privacy | — | 99 / 99 | — | PASS |

- **Why the simulated LCP is pessimistic:** the LCP element is the welcome dialog's paragraph. Observed LCP in the same run was **91 ms** (local). Lighthouse's simulator counts the 1.6 MB of `<link rel=prefetch>` map JavaScript as competing with that paint. Real throttling gave 2.2–3.3 s. I made **no performance code change**: no low-risk lever was proven, and changing code to move a simulated score is what this audit was told not to do.
- **Fixed:** map glyphs and sprites (`/map-assets/*`, about 300 KB) were served with `max-age=0`, so every visit re-downloaded them. They now get the same one-day cache as the tiles (`netlify.toml`).
- **Open:**
  - Netlify serves the `.pbf` glyphs uncompressed. Lighthouse estimates 70 KB saved by compression; this can't be verified outside Netlify.
  - The trade-off of prefetching the map chunk on slow connections should be evaluated with field data (P2).

## 12. Search engine tooling: checklist (none done yet)

Do these **after** the domain decision (P1-8). Changing the canonical host after submission throws away accumulated signals.

1. Decide the final domain. Set `VITE_SITE_URL` in Netlify (canonicals and the sitemap follow automatically). Make `*.netlify.app` 301 to it.
2. Google Search Console: add a **Domain property** (DNS TXT verification), submit `https://<domain>/sitemap.xml`, and run URL Inspection on `/` and `/about.html` (check the rendered HTML and canonical).
3. Bing Webmaster Tools: import from GSC and submit the sitemap.
4. Monitor monthly: Pages/Indexing report (expect 4 indexed until locality pages ship), Core Web Vitals report (needs traffic for CrUX), Manual actions, Security issues, crawl errors.
5. Search performance: track queries containing "rent", "pg", "1rk", "waterlogging" plus locality names once locality pages exist.
6. Analytics: **none installed**. If added, use a cookie-free tool (SPEC §2 names Cloudflare Web Analytics or Umami), update the CSP, and disclose it on the Privacy page.

Nothing has been verified or submitted. This checklist is all future work.

## 13. Issues found

| ID | Issue | Severity | Status |
|---|---|---|---|
| SEO-1 | No data-driven indexable pages; rents and medians are JS-only | High (growth) | **Open**: gated on data (§5) |
| SEO-2 | Privacy and Terms reachable only from a one-time dialog; About linked nowhere | Medium | **Fixed** |
| SEO-3 | Generic Netlify 404 with no way back | Low | **Fixed** (`404.html`) |
| SEO-4 | Sitemap `lastmod` always "today" | Low | **Fixed** |
| SEO-5 | About described a placement flow the app doesn't use, and omitted PG/1RK, water, power and the limits | Low (accuracy) | **Fixed** |
| SEO-6 | `<noscript>` said only "needs JavaScript" | Low | **Fixed** |
| SEO-7 | Map glyphs re-downloaded every visit (`max-age=0`) | Low (perf) | **Fixed** (cache header, needs deploy) |
| SEO-8 | Glyphs served uncompressed | Low (perf) | Open (verify on Netlify) |
| SEO-9 | No Search Console / Bing / analytics | Medium | Open (needs domain) |
| SEO-10 | Lab LCP borderline; no field data | Medium | Open (real phone + RUM) |
| SEO-11 | No visible intro on the map page after the welcome is dismissed | Low | Open (design decision) |
| SEO-12 | About promises unbuilt features ("Coming next") | Low | Open (your decision) |

## 14. Fixes implemented (this change; nothing deployed)

| Fix | Files |
|---|---|
| Footer navigation on About, Privacy, Terms; new 404 page | `about.html`, `privacy.html`, `terms.html`, `404.html`, `src/styles/page.css`, `vite.config.ts` (build input) |
| Sitemap without `lastmod` | `vite.config.ts` |
| Accurate, fuller About copy (flow, PG/1RK, water/power/monsoon, limits, list view) | `about.html` |
| Privacy link on the rent form; descriptive `<noscript>` with links | `index.html`, `src/styles/main.css` |
| One-day cache for `/map-assets/*` | `netlify.toml` |

## 15. Remaining work

See [WEBSITE_LAUNCH_GAP_ANALYSIS.md](WEBSITE_LAUNCH_GAP_ANALYSIS.md): SEO-1 (P2, data-gated build script, about 10–16 h), SEO-9 (P1 after the domain), SEO-10 (P0 field check), SEO-8 and SEO-11 (P2), SEO-12 (P3).
