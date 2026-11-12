# SEO and Accessibility: Test Results

**Date:** 12 Nov 2026 · **Code under test:** `c78d677` (before) and the working tree of this change (after) · Reports: [SEO_AUDIT_REPORT.md](SEO_AUDIT_REPORT.md), [ACCESSIBILITY_AUDIT_REPORT.md](ACCESSIBILITY_AUDIT_REPORT.md)

**Statuses:** PASS · FAIL · PARTIAL · NOT RUN · NOT APPLICABLE · NOT VERIFIED

## Environment

| | |
|---|---|
| Machine | macOS (Darwin 27.2), Node 24.21, Deno (Homebrew), PostgreSQL client (Homebrew) |
| Browser | Google Chrome (installed app), headless `--headless=new`, software WebGL (SwiftShader) for the scripted runs |
| Local server | `vite preview` serving `dist/` from `npm run build`, with `netlify.toml`'s production CSP injected on every document |
| Production | https://guwahati-rent.netlify.app (live = `v0.4.0`), read-only GETs only |
| Data | Real public views on the live Supabase project (read-only). **Every write was blocked**: any non-GET request and any `/functions/v1/` call was failed in the browser before it left. Live data: 9 rents in 6 localities, 0 To-Let boards. |
| Tools added | **None to the project.** axe-core 4.10.3 (`axe.min.js` from jsDelivr) and Lighthouse 12.8.2 (`npx`) ran from a scratch directory outside the repo. The audit harness (`audit.mjs`, about 400 lines; CDP over Node's built-in WebSocket, same approach as `scripts/browser-smoke.mjs`) also lived outside the repo. |

**Limitations that apply throughout:**
- Keyboard tests are scripted key events, not a person.
- No screen reader was used.
- No real phone was used.
- Lighthouse numbers are lab data from one Mac on one network.
- Turnstile can't issue tokens on localhost, so no form was submitted end to end.

---

## 1. Project test suites (after the changes)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS (0 errors) |
| `npm run lint` | PASS (0 problems) |
| `npm test` | PASS: 40 / 40 |
| `npm run test:deno` | PASS: 14 / 14 |
| `npm run test:db` | PASS: 80 / 80 (fresh Postgres + PostGIS, all 9 migrations) |
| `npm run build` | PASS: 7 HTML pages incl. new `404.html`; `main` JS 18.7 KB gz (+0.3 KB); sitemap 4 URLs |
| `npm run test:browser` | PASS: 207 PASS, 0 FAIL, 0 NOT RUN, 24 INFO (6 viewports on the production build + 7 demo modes) |
| `npx prettier --check` on changed files | PASS (after `--write` on 6 files whose new lines needed wrapping) |
| `npm audit --omit=dev` | PASS: 0 vulnerabilities (7 moderate in lint tooling only, unchanged) |
| `grep -rlE 'service_role\|SERVICE_ROLE\|sb_secret_[A-Za-z0-9]{10,}' dist/` | PASS: no matches |
| `git log --all --oneline -- .env` | PASS: empty; `.env` is gitignored |

Baseline before any change (same commands): typecheck, lint, 40 Node, 14 Deno, build all PASS.

## 2. Production HTTP checks (curl, read-only)

| URL | Status | Notes |
|---|---|---|
| `http://…/` | 301 → `https://…/` | HTTPS enforced |
| `/` | 200 `text/html` | HSTS preload, CSP, nosniff, XFO DENY present; no `X-Robots-Tag` |
| `/about.html`, `/privacy.html`, `/terms.html` | 200 | |
| `/about` | 200 | Pretty-URL duplicate; canonical → `/about.html` (PARTIAL, acceptable) |
| `/about/` | 301 → `/about` | |
| `/index.html` | 200 | Duplicate of `/`; canonical → `/` |
| `/admin.html`, `/unsubscribe.html` | 200 | `noindex, nofollow` meta |
| `/robots.txt` | 200 `text/plain` | Correct rules + sitemap URL |
| `/sitemap.xml` | 200 `application/xml` | Valid; 4 URLs; `lastmod` = build date (removed in this change) |
| `/og-default.png` | 200 | 1200×630 PNG, 72 KB |
| `/does-not-exist`, `/beltola/` | 404 | Netlify default 404 page (branded `404.html` added in this change) |
| `/map-assets/fonts/…/0-255.pbf` | 200 | `Cache-Control: max-age=0`, no `Content-Encoding` (cache header added in this change; compression open) |

## 3. Lighthouse 12.8.2 (mobile form factor)

Command: `npx -y lighthouse@12 <url> --chrome-flags="--headless=new" --output=json --only-categories=performance,accessibility,seo,best-practices` (plus `--throttling-method=devtools` where stated).

### Production, simulated throttling (default: 150 ms RTT, 1.6 Mbps, 4× CPU)

| Page | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | SI |
|---|---|---|---|---|---|---|---|---|---|
| `/` | **55** | 100 | 93 | 100 | 1.8 s | **4.0 s** | **2,120 ms** | 0.025 | 5.3 s |
| `/about.html` | 99 | 100 | 93 | 100 | 1.3 s | 1.3 s | 0 ms | 0 | 2.9 s |
| `/privacy.html` | 99 | 100 | 93 | 100 | 1.2 s | 1.2 s | 0 ms | 0 | 3.2 s |

- Map page LCP element: the welcome dialog's paragraph. TTFB 912 ms (23 %), render delay 3,041 ms (77 %).
- Longest task: 1,449 ms in `map-*.js` (MapLibre).
- Best-practices 93 on every page: one console CSP error from Netlify's injected badge (`/.netlify/scripts/hud`, known item P1-3, decided "leave as is").
- `uses-text-compression`: 4 glyph `.pbf` files, about 70 KB saveable.

### Production, applied (DevTools) throttling, 2 runs

| Run | Perf | FCP | LCP | TBT | CLS | TTI | Longest task |
|---|---|---|---|---|---|---|---|
| 1 | 93 | 2.0 s | 2.2 s | 80 ms | 0.025 | 4.6 s | 113 ms |
| 2 | 81 | 3.0 s | 3.3 s | 70 ms | 0.025 | 5.9 s | 108 ms |

### Local `vite preview`, simulated throttling, 3 runs (before changes)

Perf 89 / 89 / 89 · LCP 3.8 s ×3 · TBT 20–70 ms · CLS 0.025. In the same runs, **observed** LCP was 91 ms and FCP 77 ms. The simulated LCP comes from Lighthouse modelling the prefetched map JS (1.6 MB uncompressed) as competing with the first paint.

**Interpretation:** results swing between 55 and 93 depending on the method. CLS is consistently good. LCP sits around the 2.5 s line under real throttling. **Core Web Vitals: NOT VERIFIED.** That needs CrUX data or a budget Android phone on 4G.

## 4. axe-core 4.10.3

Tags: `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`. Production build + real CSP.

| Page / state | Before | After |
|---|---|---|
| `/about.html`, `/privacy.html`, `/terms.html`, `/unsubscribe.html`, `/admin.html` (signed out) | 0 | 0 |
| `/404.html` | n/a (didn't exist) | 0 |
| `/` welcome dialog | 0 | 0 |
| `/` map view, desktop 1366 | 0 | 0 |
| `/` map view, 375 touch | — | 0 |
| `/` Filters dialog | **4 color-contrast** (measured during the 160 ms open animation at 60 % opacity: an artifact) | 0 (measured after 600 ms) |
| `/` Stats dialog | 0 | 0 |
| `/` List view | 0 | 0 |
| `/` List view with a To-Let board (stubbed) | n/a | 0 |
| `/` Board dialog (stubbed) | n/a | 0 |
| `/` Pin details dialog | 0 | 0 |
| `/` Report dialog | 0 | 0 |
| `/` Placement mode | 0 | 0 |
| `/` Rent form dialog | 0 | 0 |

"Needs review" (axe couldn't decide): color-contrast on dialog titles, close buttons, `.pin-rent`, the ₹ prefix, the legend and the attribution links. Checked by hand against the CSS: ink `#102a35` on white (15:1); ink-2 on the white legend panel (10:1); attribution `rgba(0,0,0,.75)` on a white chip. **PASS (manual).**

## 5. Scripted keyboard, focus, reflow and live-region checks

Harness: trusted `Input.dispatchKeyEvent` via CDP; focus geometry via `getBoundingClientRect` + `elementFromPoint`; accessibility tree via `Accessibility.getPartialAXTree`.

| Check | Before | After |
|---|---|---|
| Welcome: focus into dialog; Tab confined to its 3 controls; Enter closes | PASS | PASS |
| Skip link → next Tab lands on the first map tool | **FAIL** (target `#main-actions` holds no visible control on desktop) | PASS |
| 40 Tab stops: focus ring on every stop (2.4.7) | PASS | PASS |
| 40 Tab stops: none covered or off-screen (2.4.11) | PASS | PASS |
| Forced colours emulated: computed ring on a focused toolbar button | **FAIL** (`box-shadow: none; outline-style: none`) | PASS (`outline: 2px solid`) |
| Map canvas focusable and named | PASS | PASS |
| Filters: Enter opens, Space toggles, URL `?bhk=2`, Esc closes, focus returns | PASS | PASS |
| Stats: Esc returns focus | PASS | PASS |
| List: Enter on a row opens details; Esc returns to the row | PASS | PASS |
| To-Let board listed in the list view | **FAIL** (no such UI; boards were map-only) | PASS: "To-Let board near Beltola · Pinned 3 days ago · Expires in 57 days" |
| Board: Enter opens the dialog; Esc returns to the item | not possible | PASS |
| Toast region while idle: rendered, in AX tree as `status`/`polite` | **FAIL** (`hidden`, so out of the tree) | PASS (1×1 px, not ignored) |
| Copy link → toast text appears in that region | PASS (text) / unreliable announcement | PASS |
| Report: empty submit → error, focus to the first reason, `aria-invalid` | PASS | PASS |
| Pin your rent via keyboard → placement; focus "Use this spot" | PASS | PASS (now with `aria-describedby` instructions) |
| Arrow keys on the map, then "Use this spot" opens the form | PASS | PASS |
| Rent form: empty rent → inline error, `aria-invalid`, focus on Rent, summary shown | PASS | PASS |
| Rent form: ₹500 → "Expected between ₹5,000 and ₹90,000 a month." | PASS | PASS |
| Rent form: valid submit | NOT VERIFIED (Turnstile can't issue a token on localhost; the form waits 8 s, then asks to complete the spam check) | NOT VERIFIED |
| Reflow 320×640: every page, no horizontal scroll | PASS | PASS |
| Reflow 320 / 640 (=200 %) / 375: welcome, Filters and Stats dialogs fit; controls not clipped | PASS | PASS |
| List view at 320 and 375: no page overflow (table scrolls in its own box) | PASS | PASS |
| Text spacing (1.4.12) at 320 / 640 / 375 | PASS* | PASS* |
| Touch 375: targets < 24 px outside dialogs | PARTIAL* | PARTIAL* |
| JavaScript disabled: map page content | INFO: only "needs JavaScript" + 3 links | INFO: description + About/Privacy/Terms links |

\* Text spacing: the only flag was `.tool-long` ("waterlogging"), which is deliberately visually hidden below 640 px. That is a false positive. Touch targets: only the inline attribution links (59×14, 85×14), which the inline-text exception covers.

**Test fixture:** live production has 0 To-Let boards. To test the board UI, the harness answered the GET `public_tolet` request in the browser with one fictional board (Beltola centre, no photo). Nothing was written anywhere.

## 6. Visual checks (screenshots reviewed)

Placement mode at 1366 (instructions + keyboard hint + Cancel / Use this spot fit on one bar), the list view with the boards block at 375, and the About footer at 375. No overlap or clipping.

## 7. Not performed

| Test | Status | Why / what's needed |
|---|---|---|
| VoiceOver / TalkBack / NVDA | NOT RUN | Not available headless. Needs a person (gap P1-7). |
| Real phones (budget Android on 4G, iPhone) | NOT RUN | No device. Gap P0-8. |
| Field Core Web Vitals (CrUX / RUM) | NOT RUN | No traffic data; no analytics installed. |
| Google Rich Results Test / Search Console / PageSpeed Insights | NOT RUN | No Google account access; domain undecided. |
| Any production write (submit, edit, delete, report, To-Let upload) | NOT RUN | Forbidden by the brief; checklist P0-2. |
| Turnstile interactive challenge with assistive tech | NOT RUN | Site key not valid on localhost. |
| W3C HTML/CSS validators | NOT RUN | Needs a network upload. Static IDs checked instead: `grep -o ' id="…"' dist/*.html \| sort \| uniq -d` finds no duplicates in any of the 7 built pages. At runtime only two IDs are set: the date picker moves `as-of` from the hidden input to the visible one (`removeAttribute` first), and the dev-only demo banner. |
| Netlify deploy preview `X-Robots-Tag` | NOT VERIFIED | No preview URL available. |
| Browser text-only zoom (Firefox) | NOT RUN | Chrome page zoom was used. |
