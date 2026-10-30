# Guwahati Rent — Full Project Context

> A single, self-contained briefing on the **guwahati-rent** project: product, status, stack, architecture, data model, security rules, UI layout, colour palette, typography, components, copy and roadmap. Written so another AI assistant (or a new developer) can understand the whole project without access to the repo.
>
> Snapshot date: 30 Oct 2026. Source of truth in the repo is `SPEC.md` (v2); this file summarises it plus what is actually built.

---

## 1. What it is

**Guwahati Rent** is an anonymous, crowdsourced **rent map for Guwahati** (Assam, India).

- **Tagline:** "Real rents, pinned by real renters"
- **Page title:** "Guwahati Rent — real rents, pinned by real renters"
- **Meta description:** "See what people in Guwahati actually pay in rent, area by area. Anonymous, free, no login, no brokers. Pin your rent in 30 seconds."
- **Positioning:** broker-quoted prices on portals are inflated; real rents from real renters are the truth. Free, no login, no broker.
- **Inspiration:** the *concept* of bengaluru.rent (static page + Supabase + email, grew via area SEO pages and WhatsApp sharing). We copy the idea only, never their code, design or copy.

### Who it serves (full vision)
1. **Renters** drop a pin with what they actually pay. No login. *(built)*
2. **Owners** list a whole flat or room directly. No broker, no fee. *(Phase 3)*
3. **Seekers** drop a pin with budget + preferences; a nightly job matches them with nearby listings and emails both sides one daily digest. *(Phase 3)*
4. **Anyone** can photograph a To-Let board and put it on the map (admin-approved). *(Phase 4)*
5. **Guwahati-specific data on every pin:** monsoon waterlogging, water supply, power backup/cuts. *(built)*

### Why Guwahati is different
- Much lower rents (2 BHK often ₹10–20k).
- Small online rental market (~1–2k live portal listings); much renting is offline (word of mouth, To-Let boards).
- No metro. **Monsoon waterlogging is a top concern** → it is the headline differentiator.
- Large student demand → PG and 1RK are first-class property types.
- Running cost must stay ~₹0 (free tiers everywhere).

### Non-goals (never build)
User accounts, chat, payments, comments, ratings, mobile app, AI features, satellite layer, metro layer, **any community/religion/caste/ethnicity field or filter**.

---

## 2. Current status

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold, DB schema, security gate script | **Done** |
| 1 | Map + rent pins (place, submit, view, delete, share) | **Done & tested locally** |
| — | Migration 0003: detailed living conditions (water, monsoon, power cuts, maintenance) | **Done** |
| — | Dev-only demo mode (fictional pins at various densities) | **Done** |
| 2 | Trust, stats, waterlogging heatmap, filters, list view | **Next** |
| 3 | Listings, seekers, matching, email digests | Planned |
| 4 | To-Let boards, admin, SEO locality pages, launch | Planned |

Not yet done by the human owner: connect a real Supabase project, deploy to Netlify, seed ~50 real pins.

---

## 3. Tech stack (fixed — no frameworks)

| Layer | Choice | Notes |
|---|---|---|
| Build tool | **Vite 6** (multi-page) | vanilla-ts template |
| Frontend | **Vanilla TypeScript** | Native `<dialog>`, `<form>`, `FormData`. **No React/Vue/Svelte/Next/Tailwind.** |
| Map renderer | **MapLibre GL JS 5** | Lazy-loaded via dynamic `import()` after first paint |
| Basemap | **Protomaps PMTiles** (Guwahati extract, 3.1 MB, schema v4) | Served from the site itself at `/tiles/guwahati.pmtiles`; no API key |
| Basemap style | `@protomaps/basemaps` v5, flavour **"light"**, labels in English | Fonts + sprite self-hosted under `/map-assets/` |
| Database | **Supabase Postgres + PostGIS** | Free tier, Mumbai region |
| Server logic | **Supabase Edge Functions** (Deno/TS) | **All writes** go through these |
| Scheduled jobs | pg_cron + pg_net | Outliers, matching, cleanup, digests |
| Email | Resend free tier | One digest/person/day, hard cap 95/day (Phase 3) |
| Spam protection | **Cloudflare Turnstile** | Every public form, verified server-side |
| Validation | Zod (Edge Functions) + shared plain-TS rules file used by both browser and Deno |
| Hosting | **Netlify** (static) | Node 22 build |
| Analytics | Cookie-free (Cloudflare Web Analytics or Umami) | Not yet added |

**Allowed dependencies only:** `maplibre-gl`, `pmtiles`, `@protomaps/basemaps`, `@supabase/supabase-js`, `zod`, `browser-image-compression`; dev: `vite`, `typescript`, `typescript-eslint`, `eslint`, `prettier`, `tsx`.

**Performance budget:** map-page JS (excluding MapLibre) < 60 KB gzipped (currently ~7 KB). Lighthouse mobile: Performance ≥ 80, Accessibility ≥ 95. Reads use plain `fetch` to PostgREST rather than supabase-js to keep the bundle small.

---

## 4. Repository layout (as built)

```
guwahati-rent/
├── index.html            # the map app (all dialogs live here)
├── about.html            # static About page
├── privacy.html, terms.html
├── unsubscribe.html      # placeholder (Phase 3)
├── admin.html            # placeholder (Phase 4)
├── src/
│   ├── main.ts           # boot, state, placement flow, wiring
│   ├── map.ts            # MapLibre + PMTiles, click handling, MapView API
│   ├── layers.ts         # pin/cluster layer styles + COLOR constants
│   ├── tiles.ts          # PMTiles source with range-request fallback
│   ├── api.ts            # all network calls (PostgREST reads, Edge Function writes)
│   ├── config.ts         # VITE_ env, centre coords, BACKEND_READY flag
│   ├── format.ts         # ₹ formatting, labels for every enum
│   ├── tokens.ts         # edit tokens, browser id, consent (localStorage)
│   ├── localities.ts     # loads public/localities.json
│   ├── types.ts
│   ├── forms/rent-pin.ts # rent form logic + client validation
│   ├── ui/dialog.ts, pin-card.ts, toast.ts, turnstile.ts
│   ├── demo/             # dev-only fictional data
│   └── styles/main.css (app), page.css (static pages)
├── public/
│   ├── favicon.svg, localities.json
│   ├── tiles/guwahati.pmtiles
│   └── map-assets/fonts (Noto Sans), sprites (Protomaps light)
├── supabase/
│   ├── migrations/0001_init.sql, 0002_cron.sql, 0003_living_conditions.sql
│   └── functions/
│       ├── _shared/ cors, crypto, geo, http, localities, ratelimit, rules, supabase, turnstile
│       ├── submit-pin/
│       └── edit-pin/
├── scripts/security-check.sh   # anon-key security gate
├── tests/rules.test.ts         # node --test
└── netlify.toml, vite.config.ts, .env.example
```

---

## 5. Security rules (absolute — never break)

1. **Anon key must never read email or phone.** Contacts live in separate tables, RLS on, no policies, never in a public view.
2. **Anon has no INSERT/UPDATE/DELETE** on any table. All writes go through Edge Functions using the service role.
3. Anon can only `SELECT` from public views and `EXECUTE area_stats()`. Every other function is revoked.
4. Never disable RLS; never write a policy `using (true)`.
5. Service role key never in frontend, `VITE_` vars, or git.
6. **Turnstile on every public form**, verified server-side before any DB write.
7. **Coordinates rounded to 3 decimals (~100 m) server-side** before storage.
8. Edit/delete uses a **secret token**: random token on create, only its SHA-256 hash stored, plain token kept in the creator's localStorage.
9. **No community / religion / caste / ethnicity fields or filters. Ever.**
10. **Medians, not averages** for rent stats. No stat shown from fewer than 3 pins.
11. Max one digest email per person per day; hard cap 95 emails/day.
12. Contact data shared only with matched/interested parties, with an explicit consent checkbox.
13. Never scrape other portals. **Never invent seed data.**
14. Pins render via **one GeoJSON source + MapLibre layers**. Never one DOM marker per pin.
15. Unsubscribe = page with a button that POSTs. Never unsubscribe on GET.

A script (`npm run security-check`) hits the live API with the anon key and must print PASS for: contacts unreadable, raw `pins` table unreadable, `public_pins` readable without private columns, anon insert refused, internal RPCs refused, `area_stats` allowed.

---

## 6. Data model (Postgres)

### Enums
- `pin_kind`: rent, listing_whole, listing_room
- `property_type`: flat, independent, pg, 1rk, room, studio
- `furnishing`: furnished, semi, unfurnished
- `waterlog_level`: none, road_only, enters_premises, unknown
- `row_status`: active, hidden, archived
- `move_in`: asap, next_month, flexible
- `pref3`: yes, no, any

### Tables
- **pins** — rent data and (later) listings. Key columns: kind, property_type, bhk (0–5; 0 = room/PG/1RK/studio), rent (₹1,000–5,00,000), furnishing, gated, maintenance_incl, deposit_months, sqft, parking_cars, society_name, occupants (family/bachelor), pets_allowed, waterlogging, water_supply, power_backup, pg_meals, pg_gender, listing-only fields, one_liner (≤150), locality_slug, location (PostGIS point, rounded), is_outlier, report_count, status, edit_token_hash, created_at, listing_expires_at.
  - **Added by migration 0003 (all optional):** water_sources[], water_availability (24h / daily_fixed / daily_limited / alternate_day / irregular / unknown), water_litres, water_hours, water_extra_cost (none/tanker/charge/both), water_shared, drinking_water (supplied/purifier/buy_cans/boil_filter/other), water_note, waterlog_where[] (access_road / neighbourhood / entrance / parking / ground_floor / inside_home), waterlog_severity (minor/moderate/severe), waterlog_duration (under_3h / 3_to_12h / 12_to_48h / over_48h), road_in_rain (usable/difficult/cut_off), floor_level (ground/upper/whole_house), waterlog_note, power_cuts (rare/weekly/daily/several_daily), maintenance_amount, conditions_as_of (date).
  - `waterlogging` summary is **derived server-side** from the detail: "no" → none; any of entrance/parking/ground_floor/inside_home → enters_premises; access_road only → road_only; otherwise unknown.
- **pin_contacts**, **seekers**, **seeker_contacts**, **matches**, **interests**, **reports**, **tolet_boards**, **rate_limits**, **admins** (most used from Phase 2+).

### Public views (the only things anon can read)
`public_pins` (active, < 3 reports, not expired; exposes lat/lng but no contact or token columns), `public_tolet`, `public_seeker_dots` (blurred to ~1 km), `public_stats_city`, `public_stats_locality` (medians, n ≥ 3, % severe waterlogging).

### Server functions
`area_stats(bbox)` (public), `hit_rate_limit`, `flag_outliers` (rent > 3× or < ⅓ locality median, n ≥ 5), `run_matching`, `cleanup` (expire listings → rent pins, delete contacts, retention).

### Plausibility bands (rent rejected outside these)
| Type | Min ₹ | Max ₹ |
|---|---|---|
| Room / PG bed | 1,500 | 30,000 |
| 1RK / studio | 2,000 | 20,000 |
| 1 BHK | 3,000 | 45,000 |
| 2 BHK | 5,000 | 90,000 |
| 3 BHK | 7,000 | 1,50,000 |
| 4+ BHK | 10,000 | 3,00,000 |

City bounding box: lng 91.55–91.95, lat 26.05–26.25. Map centre: `[91.7362, 26.1445]`. 30 localities in `localities.json` (Beltola, Survey, Six Mile, Khanapara, Kahilipara, Zoo Road, Dispur, Ganeshguri, Hatigaon, Rukminigaon, GS Road, Chandmari, Silpukhuri, Uzan Bazar, Paltan Bazar, Fancy Bazar, Lachit Nagar, Ulubari, Bamunimaidam, Noonmati, Narengi, Lalganesh, Maligaon, Adabari, Jalukbari, Garchuk, Lokhra, Bhetapara, Basistha, Jorabat). A pin gets the nearest locality within 3 km.

---

## 7. Edge Functions (built so far)

Common pattern: CORS allow-list → parse + Zod validate (400) → Turnstile verify (403) → rate limit by hashed IP **and** hashed browser id (429) → service-role work → `{ ok: true, ... }` or `{ ok: false, error: "<human-readable>" }`.

| Function | Does | Rate limit |
|---|---|---|
| `submit-pin` | Plausibility band → bbox check → round coords to 3 dp → nearest locality → derive waterlogging summary → create edit token → insert. Returns `{ id, editToken }`. | 5/day |
| `edit-pin` | Verifies `sha256(editToken)`; currently supports **delete** (archive). | 30/day |

Planned: submit-seeker, edit-seeker, report-pin, express-interest, tolet-upload-url, submit-tolet, admin-review, unsubscribe, send-digests.

---

## 8. UI & UX

### 8.1 Overall layout (mobile-first, single screen)
```
┌───────────────────────────────────────────────┐
│ [pin logo] Guwahati Rent  tagline… [+Pin] About│  ← fixed top bar, 52px, white
├───────────────────────────────────────────────┤
│ ● Gated  ○ Not gated  1,234 rents pinned      │  ← legend chip, top-left
│                                               │
│              full-screen map                  │
│        (clusters ⬤ 12 / ~₹14k, dots, ₹14k)    │
│                                          [+]  │  ← zoom
│                                          [◎]  │  ← geolocate
│          ( ＋ Pin your rent )                 │  ← floating pill button (touch only)
└───────────────────────────────────────────────┘
```
- **Body never scrolls**; the map fills everything under the top bar. Safe-area insets respected (notched phones).
- **Touch devices:** a large floating "＋ Pin your rent" pill button at bottom centre.
- **Mouse devices:** the FAB is hidden; a small "＋ Pin your rent" button appears in the top bar, plus a dark pill hint at the bottom: "Click any empty spot on the map to pin your rent", and the cursor becomes a crosshair over empty map.
- Tagline hides under 480 px width.
- No map rotation or pitch (2D only).

### 8.2 Adding a pin (placement flow)
1. Tap "Pin your rent" → map zooms to street level (z15–16).
2. A **fixed orange map-pin icon** sits at the screen centre; the user moves the map underneath it. The map gets a 4 px orange inset border. A white card banner at the top (orange 2 px border) says: **"Move the map until the pin is on your home.** A nearby spot is fine. We round it to about 100 m." with **Cancel** (ghost) and **Use this spot** (primary) buttons.
3. Desktop shortcut: click any empty map spot directly.
4. Spots outside Guwahati → error toast: "That spot is outside Guwahati. Only Guwahati pins are accepted for now."
5. Form dialog opens ("What do you pay?"), showing the nearest locality. An orange draft dot marks the chosen spot. "Move pin" returns to placement.
6. Submit → pin appears immediately → **share dialog**: "Thanks, your rent is on the map" with **Share on WhatsApp** (green), Copy link, Done.

### 8.3 Dialogs
Native `<dialog>`. **Bottom sheet on phones** (rounded top corners 20 px, slides up 24 px in 0.18 s), **centred card on ≥ 640 px**. Max height 88dvh, scrollable body, sticky action bar with a top divider. Backdrop: `rgba(11,30,38,0.45)`. Close button "✕" top-right (44×44).

| Dialog | Content |
|---|---|
| Welcome (first visit) | "What do people in Guwahati actually pay?" + short pitch + 3 green-tick bullets (no login/name/phone; locations rounded ~100 m; free, no brokers) + privacy/terms consent line. Button: "Show me the map". |
| Rent form | See 8.4 |
| Pin details | See 8.5 |
| Shared | WhatsApp share text: "What do people in Guwahati actually pay in rent? I just added mine, anonymously. See your area and add yours: <site>/" |

### 8.4 Rent form ("What do you pay?")
Sections separated by `h3` headings with a top border:
- **The home** — Type of home (segmented pills: Flat · Independent · 1RK · Room · PG), Bedrooms (1 BHK · 2 BHK · 3 BHK · 4 BHK · 5+; hidden for room/PG/1RK), **Monthly rent (₹)** (large bold input with ₹ prefix, help: "What you pay each month, without electricity."), Furnishing (Unfurnished · Semi · Furnished), Gated society? (Yes, gated · No).
- **Water** — "Only what you know. Skip anything you're not sure about." How often does water come? (24 hours / Daily, fixed hours / Daily, but limited / Every other day / Irregular / Not sure) → conditional box: litres per supply day + supply hours. Extra cost for water? Shared supply? Drinking water source. Free-text note.
- **Monsoon** — "Does water collect here after heavy rain?" (No / Yes / Not sure; help: "About this home and its road only, not the whole area.") → conditional box: where (checkbox pills: road to the home, gate/entrance, parking, ground-floor rooms, inside this home, wider area nearby — required), how bad (ankle-deep or less / up to the knee / above the knee), how long, can you get in and out. Floor level. Note. "When did you last see these conditions?" (date, optional).
- **More details (optional)** — collapsible `<details>`: parking spots, building/society name, deposit (months), size (sq ft), who lives there, maintenance (included / separate → amount), power backup, power cuts, PG meals + PG for (PG only), one-liner ("Don't include names, phone numbers or your house number.").
- Turnstile widget, then actions: **Move pin** (ghost) · **Add my rent** (primary).
- Conditional sub-sections render as a tinted box (`--bg` background, 3 px teal left border, 12 px radius).
- Errors: red form-level banner (light red `#fdecec`, dark red text `#7f1d1d`, 4 px red left border) + inline "⚠ message" under each field, `aria-invalid` red border.

### 8.5 Pin detail card
- Big rent: **₹14,000** (2rem, weight 800) + muted "/month".
- Subline: "2 BHK flat · Semi-furnished · Gated society".
- Outlier warning (orange note) if flagged.
- **Condition chips** (rounded pills): neutral teal chips (e.g. "24-hour water", "No waterlogging reported") and **warning chips** in orange (e.g. "Water every other day", "Buys tanker water", "Road waterlogs in heavy rain", "Water enters the property in heavy rain"). Text always carries the meaning; colour only reinforces.
- Key-value list (label column 110 px, muted; rows separated by hairlines): Area ("Near Beltola"), Building, Floor.
- **"Living conditions"** heading with a small grey badge **"Renter-reported · not verified"**, then Water, Source, Water cost, Shared supply, Drinking water, Monsoon, Road in rain, Power backup, Power cuts, plus "For this home only. Other homes nearby may differ."
- "Other details": deposit, size, parking, maintenance, lives here, PG fields.
- One-liner as an italic quote block.
- Footer: "Pinned 3 days ago by a renter. This is what they pay, not an ad. The flat may not be available."
- Actions: Copy link; **Delete my pin** (red outline, two-tap confirm "Tap again to delete") only on the device that created it.
- Several pins at the same rounded spot → a picker list "N rents at this spot", sorted by rent.

### 8.6 Map styling
- Basemap: Protomaps **light** flavour, map background while loading `#e8eef0`.
- **Clusters:** dark teal-ink circles (`#0b3b4a`, 92% opacity) with a 3 px white stroke; radius steps 16 → 20 → 26 → 32 px at 10 / 50 / 200 points. White count label (14 px) inside, and a small "~₹14k" rough-average label below (ink text, white halo). Clicking zooms in.
- **Individual pins:** gated = **solid teal dot** (`#0e7490`, white 2 px stroke); not gated = **white dot with 3 px teal ring**. Shape carries meaning, not colour alone. Radius 5 px at z11 → 8 px at z15.
- **Price labels** ("₹14k", "₹8.5k", "₹1.2L") above each dot from zoom 13.5, ink text, white 2 px halo, Noto Sans Medium 12 px.
- **Selected pin:** orange (`#c2410c`) 3 px ring around it.
- **Draft pin:** orange dot, 9 px, white 3 px stroke.
- Controls bottom-right (zoom, geolocate), pushed up to clear the FAB.
- Planned (Phase 2): waterlogging heatmap layer (weights none 0, road 0.5, enters premises 1), toggleable.

### 8.7 Other UI elements
- **Toast:** dark ink pill above the FAB, white text, 12 px radius; error variant red.
- **Banners** (read-only, demo): white card, 5 px orange left border. Demo banner uses cream `#fff7ed` with a brown `#7c2d12` border and a "DEMO — NOT A REAL RENTAL" flag on cards.
- **Loading status:** centred white pill "Loading map…".
- **Skip link** "Skip to actions" for keyboard users.
- **Static pages** (About, Privacy, Terms): white header with "← Guwahati Rent", centred 720 px column, line-height 1.6, orange-left-border note boxes.

---

## 9. Colour palette

Calm teal + deep ink, with burnt orange as the single accent (used for attention: placement, selection, focus, warnings). Light theme only.

| Token | Hex | Used for |
|---|---|---|
| `--ink` | `#0b3b4a` | Primary text, clusters, selected segmented pills, toast, `theme-color` |
| `--ink-2` | `#33535e` | Secondary text, legend, icon buttons |
| `--muted` | `#5d7680` | Help text, labels, fine print |
| `--line` | `#d6e1e4` | Borders, dividers, input outlines |
| `--bg` | `#f4f8f9` | Page background, tinted boxes |
| `--card` | `#ffffff` | Top bar, dialogs, cards |
| `--brand` | `#0e7490` | Primary buttons, gated pin dots, logo, focus border on inputs |
| `--brand-dark` | `#0b5566` | Primary hover, links, chip text |
| `--accent` | `#c2410c` | Placement pin & border, selected pin ring, draft pin, banner borders, focus ring |
| `--danger` | `#b91c1c` | Errors, delete button |
| `--ok` | `#15803d` | Tick marks |
| `--wa` | `#128c4b` | WhatsApp button |

Supporting tints:
- Map loading background `#e8eef0`; choice-card hover `#f0f8fa`
- Neutral chip `#e7f3f6` bg / `#0b5566` text
- Warning chip `#fff1e6` bg / `#9a3412` text
- Warning note `#fff7ed` bg + `#c2410c` border
- Form error `#fdecec` bg / `#7f1d1d` text
- Demo flag `#7c2d12` bg / white text
- Dialog backdrop `rgba(11,30,38,0.45)`; shadow `0 10px 30px rgba(11,59,74,0.18)`
- Map hint pill `rgba(11,59,74,0.88)`; legend `rgba(255,255,255,0.94)`

**Focus style:** double ring `0 0 0 3px #fff, 0 0 0 6px #c2410c` (white then orange), on every focusable element.

---

## 10. Typography, shape & spacing

- **Font:** system stack only (`system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif`) — no web-font download on slow mobile networks. Map labels use self-hosted **Noto Sans** (Regular/Medium/Italic), including Bengali/Assamese and ₹ glyphs.
- Base line-height 1.45 (app), 1.6 (static pages). Inputs are 16 px to stop iOS zoom-on-focus.
- Weights: brand 750, buttons/labels 650, titles 700–800. Slight negative letter-spacing on headings (-0.01 to -0.02em).
- Sizes: dialog title 1.2rem, rent on card 2rem, field labels 0.92rem, help 0.8rem, fine print 0.85rem.
- **Radii:** buttons and pills fully rounded (999px); cards/choices 14 px (`--radius`); inputs 10 px; dialogs 20 px.
- **Touch targets ≥ 44×44 px** everywhere (buttons, pills, inputs, summary rows).
- Buttons: primary (teal fill, white text), ghost (transparent with 1.5 px line inset), danger (white with red outline), WhatsApp (green), FAB (larger, shadowed). Disabled = 55% opacity.
- Segmented controls: pill-shaped radio labels with 1.5 px border; **checked = filled ink background with white text**.
- Logo: a map-pin shape in teal with a small white house/roof inside (SVG, also the favicon).

---

## 11. Copy & tone

Plain, short, friendly, honest. Indian number format (₹14,000; ₹1.2L). Never overstate data quality.

Examples in use:
- "Brokers quote high. This map shows the rents real tenants pay, shared anonymously."
- "It takes 30 seconds and helps the next person who's flat-hunting."
- "Your rent stays anonymous."
- "Only what you know. Skip anything you're not sure about."
- "That rent looks off for this type of home. Expected between ₹5,000 and ₹90,000 a month."
- "This is what they pay, not an ad. The flat may not be available."
- "Renter-reported · not verified"
- Conditions are always worded as reports about one home, never as facts about an area.

---

## 12. Accessibility (WCAG 2.2 AA target)

- Native dialogs with `aria-labelledby`, focus moved in and returned to the trigger, Esc closes.
- Every field has a visible label; errors linked via `aria-describedby`; `role="alert"` for form errors; live regions for status and toasts.
- Meaning never by colour alone (solid vs ring pins; chip text).
- `prefers-reduced-motion` respected (no fly-to animation, no sheet animation).
- Map region has a descriptive `aria-label`. Phase 2 adds an **accessible list/table view** of the same filtered data (sortable headers with `aria-sort`), because maps are unusable with screen readers.

---

## 13. Privacy behaviour

- Rent pins are public (amount, type, approx. location rounded ~100 m, optional details). No login, no name, no contact.
- IPs and browser ids stored only as salted hashes, for rate limiting and report de-duplication.
- The device that created a pin keeps a secret edit token in localStorage; only that device can delete it.
- Consent to privacy/terms is remembered in localStorage (`gr.consent.v1`).
- Planned retention: seekers 30 days, listings 45 days (renewable), interests 60 days; contacts deleted on expiry/unsubscribe.

---

## 14. Dev-only demo mode

`npm run dev`, then `/?demo=normal|dense|stress|crowded|packed|max` (25 → 20,000 fictional pins, generated deterministically in the browser). Shows a DEMO MODE banner, every card says "DEMO — NOT A REAL RENTAL", real pins aren't loaded, adding is disabled. Compiled out of production builds. Exists because the spec forbids inventing seed data in the database.

---

## 15. Roadmap

**Phase 2 — Trust, stats, waterlogging, filters, list view (next)**
- Rate limiting in all functions; `report-pin` + report UI (auto-hide at 3 reports)
- "Double-check this rent?" step when rent > 2× locality median
- Filters dialog, synced to the URL: type, BHK (1RK/1/2/3/4+), rent range, furnishing, gated, property type, hide "water enters premises", posted within 30/90/180 days
- Stats dialog: city + locality **medians** (never buckets < 3 pins)
- Waterlogging heatmap + toggle
- Accessible list view
- `edit-pin` update action

**Phase 3 — Listings, seekers, matching, digests:** owner listings with consent, seeker pins, "Flat Hunt" mode, interest form, nightly matching, one daily digest email per person (≤ 95/day), POST-only unsubscribe page.

**Phase 4 — To-Let boards, admin, SEO, launch:** phone photo upload (compressed ≤ 150 KB) → admin approval → To-Let layer; admin page with email OTP; static SEO pages per locality (`/beltola/` etc., only with enough data) + sitemap; GitHub Actions for backups, keep-alive and nightly rebuild.

**Later (after ~300 real pins):** draw-a-rectangle area stats, watch-this-area alerts, spotter leaderboard, distance to hubs, nearby schools/hospitals, per-pin share pages.

**Launch bar:** 150+ real pins across 15+ localities before any public post. Launch hook: the monsoon waterlogging map. Channels: r/guwahati, college/hostel WhatsApp groups, local Facebook groups, local media.

---

## 16. Running it

```bash
npm install
npm run dev            # http://localhost:5173 (read-only without .env)
npm run typecheck && npm run lint && npm test && npm run build
npm run security-check # needs SUPABASE_URL + SUPABASE_ANON_KEY
```

Frontend env (`.env`, public by design): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_TILES_URL` (optional), `VITE_SITE_URL`.
Function secrets (never in frontend): `TURNSTILE_SECRET_KEY`, `HASH_SALT`, `ALLOWED_ORIGINS`, later `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`.

---

## 17. Rules for anyone (or any AI) helping on this project

- Work one phase at a time; report files changed, commands run with real output, what wasn't tested, and any deviations.
- Don't add frameworks or dependencies beyond the allowed list without justification.
- Never loosen security (RLS, grants, policies) to fix an error — stop and ask.
- Never claim something is tested without showing output.
- Keep the visual language: teal/ink/orange palette, system fonts, pill buttons, bottom-sheet dialogs, 44 px targets, meaning not by colour alone.
