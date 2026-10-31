# Guwahati Rent — Next Phases (2a, 2b, 2)

> Read this together with `SPEC.md` (v2) and `README.md`. Where this file and SPEC.md disagree, **this file wins** (it is newer).
> Written 30 Oct 2026. Phase 0 and Phase 1 are **done and live**: `https://guwahati-rent.netlify.app`, Supabase project `apgdczuofczobxaggsfy` (Mumbai).
> The SQL and code below were written carefully but **not executed**. Expect small fixes. The security gate catches the ones that matter.

---

## 0. Instructions for the AI coding agent (read first)

1. **Work one phase at a time, in this order: 2a → 2b → 2.** Stop after each phase and report:
   - files created/changed
   - commands run **with their real output**
   - what you could not test and why
   - any deviation from this file, and why
2. **Stack is fixed:** Vite + vanilla TypeScript, MapLibre, Supabase (Postgres + PostGIS + Edge Functions + Storage). **No React, no UI framework, no new dependencies** without asking.
3. **The UI has changed since SPEC.md v2** (e.g. "House" instead of "Independent", orange primary buttons, form sections like "The home"). **Follow the current code and styles. Do not revert to the SPEC's wording or look.** Match existing patterns in `src/` (native `<dialog>`, `openDialog`/`closeDialog`, `toast`, `api.ts` as the only network layer).
4. **Security rules in SPEC.md §5 are absolute.** If a permission error blocks you, **stop and ask**. Never disable RLS, never add `using (true)` policies, never grant anon INSERT/UPDATE/DELETE on tables, never put a secret key in frontend code or a `VITE_` variable.
5. Tasks marked **[HUMAN]** need the owner (dashboards, secrets, deploys). List them as blockers; don't attempt them.
6. Never claim "tested" without showing output. Run `npm run typecheck && npm run lint && npm run build` and `deno check` on every changed Edge Function before reporting.

---

## 1. Lessons from Phases 0–1 (don't repeat these mistakes)

| Gotcha | Rule |
|---|---|
| MapLibre's CSS loads after ours (lazy chunk) and set `.maplibregl-map { position: relative }`, collapsing the map to 0px | Style the map container via `#map.map`, never just `.map` |
| New Supabase keys are `sb_publishable_…` (not JWTs) | Frontend sends **only** the `apikey` header. Never `Authorization: Bearer <publishable>` |
| Public Edge Functions do their own protection | Deploy with `--no-verify-jwt` and add each new function to `supabase/config.toml` with `verify_jwt = false` |
| CORS | Every function uses `_shared/cors.ts`; `ALLOWED_ORIGINS` = `http://localhost:5173,https://guwahati-rent.netlify.app` |
| Validation errors were opaque | On a 400, return the **field names** (never values) that failed, like `submit-pin` now does |
| Rate limit counted rejected input | Do cheap checks (bbox, bands, file checks) **before** `withinRateLimit` |
| Supabase SQL Editor shows only the last statement's result | Diagnostic queries must be a single `select` |
| `VITE_*` values are public | Never mark them "secret" in Netlify (the secret scanner fails the build) |
| Storage files can't be deleted with SQL | Delete objects through the Storage API (service role) in an Edge Function |
| A down/paused DB made security checks "pass" | `scripts/security-check.sh` aborts on 5xx. Keep that behaviour when extending it |

---

## 1b. Delisting policy (applies to every phase)

Things that are **available** expire. Things that are **data** age but stay.

| Item | Lifetime | What happens at expiry | Where enforced |
|---|---|---|---|
| To-Let board (2a) | **60 days** from upload | Hidden immediately (view filters `expires_at > now()`); files + row deleted by nightly `tolet-maintenance` | `tolet_boards.expires_at`, `public_tolet`, `tolet-maintenance` |
| Owner listing, whole flat or room (Phase 3) | **60 days**; owner can renew from their device (`edit-pin` action `renew`, +60 days) | Converts to an ordinary rent pin (keeps the area data); owner contact deleted | `pins.listing_expires_at`, existing `cleanup()`. **Change SPEC's 45 days to 60 in Phase 3.** |
| Seeker pin (Phase 3) | 30 days; can extend | Archived; contact deleted | `seekers.expires_at`, `cleanup()` |
| Rent pin ("what I pay") | **Never auto-deleted** | Always shows its date ("Pinned 4 months ago"). Stats, medians and the default map view use pins from the **last 18 months**; older ones stay reachable through the "Posted within → All" filter | Phase 2 (§4.3, §4.4) |
| Survey import (2b) | Same as rent pin | Same as rent pin | |

Any expiring item shows its remaining time in its dialog ("Expires in 12 days"). Reported items are hidden at 3 reports regardless of age.

---

## 2. Phase 2a — To-Let photo snap (+ minimal admin)

### 2a.1 Product
Anyone can photograph a To-Let board and put it on the map in **three taps, zero form fields**:

1. Tap **Spot a To-Let** (in `#dlg-add`; currently a disabled "coming soon" choice. Enable it.)
2. Camera opens → take photo. Location is captured from the device (fallback: tap the map).
3. Spam check → **Done**. Toast: "Thanks! Your board appears on the map once it's checked (usually within a day)."

The phone number is on the board itself; we never OCR it or ask for it. Boards are **admin-approved before going public** (photos can contain faces, number plates, homes). Boards **expire after 60 days**; their photos are deleted (see §1b).

### 2a.2 Storage design

| Item | Decision |
|---|---|
| Where | **Supabase Storage** (already provisioned). Private bucket `tolet` for pending uploads, public bucket `tolet-public` for approved images |
| Per board | Two files: `full.webp` (max 1280px long edge, quality 0.72, target ≤ 200 KB) and `thumb.webp` (max 320px, quality 0.6, target ≤ 25 KB) |
| Paths | `tolet/pending/<boardId>/full.webp`, `…/thumb.webp` → on approval `tolet-public/<boardId>/full.webp`, `…/thumb.webp` |
| Bucket limits | `file_size_limit = 512 KB`, `allowed_mime_types = {image/webp, image/jpeg}` on both buckets (server-side enforcement) |
| Budget | Free tier: 1 GB storage, 5 GB/month egress. With 60-day expiry, 20 boards/day ≈ 250 MB steady state. Map/list use thumbs; full image loads only when tapped |
| Later | If egress gets near 5 GB/month, move `tolet-public` to Cloudflare R2 (zero egress). Keep all storage calls behind one module so this is a small change |

### 2a.3 Client-side compression (`src/ui/image.ts`)
- **No library needed.** Use `createImageBitmap(file, { imageOrientation: 'from-image' })` (respects EXIF rotation) → draw on a canvas at target size → `canvas.toBlob(cb, 'image/webp', q)`.
- If the returned blob's `type` is not `image/webp` (older Safari can't encode WebP), retry with `'image/jpeg'` at 0.75 and use `.jpg` paths.
- Re-encoding **strips EXIF/GPS metadata**. This is required for privacy; never upload the original file.
- Reject inputs that aren't images, or are over 25 MB, before decoding.
- If the full image is still over 400 KB after encoding, step quality down (0.72 → 0.6 → 0.5) before giving up.
- `browser-image-compression` is already a dependency. Use it only if native canvas fails on a target browser, and say so in the report.

### 2a.4 Location
- `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }`.
- If denied, timed out, or `accuracy > 150 m` → show "Tap where the board is" using the existing placement mode (`startPlacement`).
- Client checks `inGuwahati()`; the server checks again.
- **Rounding: boards are rounded to 4 decimal places (~11 m)**, not 3. A board is public signage and must be findable. (Rent pins stay at 3 dp.)

### 2a.5 Database — `supabase/migrations/0003_tolet_and_survey.sql`

```sql
-- ===== To-Let boards: upload lifecycle, thumbnails, expiry =====
alter table public.tolet_boards drop constraint if exists tolet_boards_status_check;
alter table public.tolet_boards
  add constraint tolet_boards_status_check
  check (status in ('uploading', 'pending', 'approved', 'rejected', 'gone'));

alter table public.tolet_boards
  add column if not exists thumb_path        text,
  add column if not exists public_thumb_path text,
  add column if not exists uploader_hash     text,  -- sha256(browserId + HASH_SALT); abuse tracing only
  add column if not exists expires_at        timestamptz not null default now() + interval '60 days';

alter table public.tolet_boards alter column status set default 'uploading';
create index if not exists tolet_status_idx on public.tolet_boards (status, expires_at);

-- "Board gone" reports, one per browser per board
create table if not exists public.tolet_reports (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.tolet_boards(id) on delete cascade,
  reporter_hash text not null,
  created_at    timestamptz not null default now(),
  unique (board_id, reporter_hash)
);
alter table public.tolet_reports enable row level security;   -- no policies: service role only

create or replace function public.bump_tolet_gone() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.tolet_boards set gone_reports = gone_reports + 1 where id = new.board_id;
  return new;
end $$;
drop trigger if exists tolet_reports_bump on public.tolet_reports;
create trigger tolet_reports_bump after insert on public.tolet_reports
for each row execute function public.bump_tolet_gone();

-- Public view: approved, not reported gone, not expired. No private paths, no uploader hash.
drop view if exists public.public_tolet;
create view public.public_tolet with (security_barrier) as
select id, public_photo_path, public_thumb_path, created_at, expires_at,
       extensions.st_y(location::extensions.geometry) as lat,
       extensions.st_x(location::extensions.geometry) as lng
from public.tolet_boards
where status = 'approved' and gone_reports < 3 and expires_at > now();

-- Storage hardening
update storage.buckets
set file_size_limit = 524288, allowed_mime_types = array['image/webp', 'image/jpeg']
where id in ('tolet', 'tolet-public');

-- ===== Survey imports (Phase 2b) =====
alter table public.pins
  add column if not exists source          text not null default 'user' check (source in ('user', 'survey')),
  add column if not exists location_approx boolean not null default false,
  add column if not exists import_ref      text unique;   -- hash of the form row; makes re-imports idempotent

-- Recreate public_pins with the two new public columns appended at the END
-- (create or replace view can only add columns at the end).
create or replace view public.public_pins with (security_barrier) as
select
  id, kind, property_type, bhk, rent, furnishing, gated, maintenance_incl,
  deposit_months, sqft, parking_cars, society_name, occupants, pets_allowed,
  waterlogging, water_supply, power_backup, pg_meals, pg_gender,
  available_from, tenant_pref, room_gender_pref, room_smoking_ok, room_food_pref,
  one_liner, locality_slug, is_outlier, created_at,
  extensions.st_y(location::extensions.geometry) as lat,
  extensions.st_x(location::extensions.geometry) as lng,
  source, location_approx
from public.pins
where status = 'active'
  and report_count < 3
  and (listing_expires_at is null or listing_expires_at > now());

-- ===== Privileges =====
revoke all on public.tolet_reports from anon, authenticated;
revoke execute on function public.bump_tolet_gone() from anon, authenticated, public;
grant select on public.public_tolet, public.public_pins to anon, authenticated;
grant all on public.tolet_reports to service_role;
```

> **Check before pushing:** the existing view `public_pins` must keep its column order exactly (compare with `0001_init.sql`). If `create or replace view` errors on column order, stop and report. Don't drop the view without re-granting.

### 2a.6 Cron cleanup — `supabase/migrations/0004_tolet_cron.sql`

Files can't be deleted from SQL, so a daily Edge Function does it. Protect it with a dedicated `CRON_SECRET` (not the service role key; key formats differ between projects).

```sql
-- [HUMAN] first: create Vault secrets in the SQL editor (never in a migration file):
--   select vault.create_secret('https://apgdczuofczobxaggsfy.supabase.co', 'project_url');
--   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
select cron.schedule('tolet-maintenance', '45 21 * * *', $$   -- 03:15 IST
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/tolet-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
$$);
```

> If `project_url` already exists in Vault from earlier setup, don't create it twice.

### 2a.7 Edge Functions

All follow SPEC §7.1: CORS preflight → Zod → Turnstile (where listed) → cheap checks → rate limit → work → `{ ok, … }`. Add every function to `supabase/config.toml` with `verify_jwt = false`.

| Function | Input | Behaviour | Limit |
|---|---|---|---|
| `tolet-upload-url` | `turnstileToken`, `browserId`, `lat`, `lng`, `ext` (`webp`\|`jpg`) | Verify Turnstile → bbox check → round coords to **4 dp** → rate limit → insert `tolet_boards` row (`status='uploading'`, `photo_path`, `thumb_path`, `uploader_hash`, location) → create **two signed upload URLs** (`admin.storage.from('tolet').createSignedUploadUrl(path)`) | 5/day per IP and per browser |
| `submit-tolet` | `boardId`, `browserId` | Row must be `uploading`, created < 30 min ago, same `uploader_hash` → confirm **both** objects exist in `tolet` (`list` the folder) and each is ≤ 512 KB → set `status='pending'` | 10/day |
| `report-tolet` | `boardId`, `browserId`, `turnstileToken` | Verify Turnstile → board must be `approved` → insert into `tolet_reports` (unique per reporter); duplicates return ok silently | 10/day |
| `admin-review` | `Authorization: Bearer <user access token>`, `action: 'list' \| 'approve' \| 'reject'`, `boardId?` | `admin.auth.getUser(token)` → user id must be in `admins`, else 403. **list**: pending boards (oldest first, max 50) with 10-minute signed URLs for thumb + full. **approve**: copy both files to `tolet-public/<id>/…` (use `copy(..., { destinationBucket: 'tolet-public' })` if the installed supabase-js supports it, else download + upload), set `public_photo_path`, `public_thumb_path`, `status='approved'`, `reviewed_at=now()`, then remove the private originals. **reject**: remove files, `status='rejected'`, `reviewed_at=now()` | none (admin only) |
| `tolet-maintenance` | header `x-cron-secret` | Reject unless it matches `CRON_SECRET` (constant-time compare). Find boards that are expired, `rejected`, `gone_reports >= 3`, or `uploading` for over 2 hours → remove their files from **both** buckets → delete the rows. Log counts only | cron only |

The client uploads with `fetch(signedUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type, 'x-upsert': 'false' } })`. **Verify the exact signed-upload request format against the Supabase Storage docs for the installed version** before relying on it, and report what you verified.

### 2a.8 Frontend

| File | Change |
|---|---|
| `index.html` | Enable "Spotted a To-Let board" in `#dlg-add`. New `#dlg-tolet`: hidden `<input type="file" accept="image/*" capture="environment">`, preview `<img>`, location status line ("Using your location" / "Tap the map instead"), Turnstile container, **Put it on the map** button. New `#dlg-board` for viewing a board (thumb, tap to open full image, "Pinned N days ago", **Board is gone** button, disclaimer "Verify with the owner. Never pay before seeing the flat.") |
| `src/forms/tolet.ts` | Flow: pick photo → compress (full + thumb) → get location → Turnstile → `tolet-upload-url` → PUT both files → `submit-tolet` → close + toast. Show progress text ("Compressing…", "Uploading…"). On any failure, show the server message and reset Turnstile |
| `src/ui/image.ts` | Compression helpers (§2a.3) |
| `src/api.ts` | `fetchBoards()` from `public_tolet`; `requestToletUpload()`, `uploadToSignedUrl()`, `submitTolet()`, `reportTolet()`. Public image URL = `${SUPABASE_URL}/storage/v1/object/public/tolet-public/<path>` |
| `src/layers.ts` / `src/map.ts` | Separate GeoJSON source `tolet` (no clustering, or a separate cluster style). Distinct shape from rent pins (e.g. square or sign icon + short "To-Let" label at zoom ≥ 14) so colour isn't the only signal. Clicking opens `#dlg-board` |
| Legend | Add a "To-Let board" entry |
| `admin.html` + `src/pages/admin.ts` | **Minimal** admin: Supabase Auth email magic link (supabase-js allowed **on this page only**), list pending boards as cards (thumb, map link, created time), **Approve** / **Reject** buttons calling `admin-review`. Not linked anywhere on the public site. `noindex` meta |

Accessibility: the file input has a visible label/button, upload progress lives in an `aria-live="polite"` region, and the board dialog's image has alt text "Photo of a To-Let board".

### 2a.9 [HUMAN] steps for 2a
1. `npx supabase db push --linked` (applies 0003, then 0004 once the Vault secrets exist).
2. `npx supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"`, then put the **same value** into Vault as `cron_secret` (SQL editor).
3. Supabase → Authentication → URL Configuration: Site URL `https://guwahati-rent.netlify.app`; add `http://localhost:5173/admin.html` and `https://guwahati-rent.netlify.app/admin.html` to Redirect URLs.
4. Log in once on `admin.html` with your email, then in SQL: `insert into admins (user_id) select id from auth.users where email = '<your email>';`
5. Deploy functions: `tolet-upload-url`, `submit-tolet`, `report-tolet`, `admin-review`, `tolet-maintenance` (each with `--no-verify-jwt`).
6. Commit, push, and let Netlify redeploy.

### 2a.10 Security gate additions (extend `scripts/security-check.sh`)
Add these anon checks:
- cannot read `tolet_reports`, `tolet_boards`
- cannot INSERT into `tolet_boards`
- cannot list or download from the private bucket: `POST /storage/v1/object/list/tolet` → error or `[]`
- cannot upload to `tolet-public` directly
- `public_tolet` readable and its JSON contains no `photo_path`, `thumb_path`, `uploader_hash`, `status`
- `public_pins` still readable, with no `import_ref`

### 2a.11 Acceptance (owner verifies on a real phone)
- [ ] Spot a To-Let → camera → photo → Done in ≤ 3 taps when location is allowed
- [ ] Location denied → tap-on-map fallback works
- [ ] Uploaded files are WebP (or JPEG fallback), full ≤ ~200 KB, thumb ≤ ~25 KB (check sizes in the Storage dashboard)
- [ ] A downloaded `full.webp` contains **no** EXIF GPS (check with an EXIF viewer)
- [ ] Board does **not** appear publicly until approved on `admin.html`
- [ ] Approve → board appears on the map within a refresh; Reject → files deleted from Storage
- [ ] Non-admin logged-in user gets 403 from `admin-review`
- [ ] 3 "Board is gone" reports from 3 browsers → board disappears
- [ ] 6th upload from one device in 24 h → rejected with a clear message
- [ ] Running `tolet-maintenance` manually deletes expired/rejected rows **and** their files
- [ ] A board shows "Expires in N days" in its dialog; a board with `expires_at` in the past is not in `public_tolet`
- [ ] Extended security gate: all PASS on the live project

---

## 3. Phase 2b — Survey import (seed real pins with consent)

### 3.1 Why
Real renters (friends, colleagues, WhatsApp groups, r/guwahati) fill a **Google Form**; the owner imports the responses in bulk. This bypasses the 5/day public limit **without** scraping or inventing data. Every row is from a person who agreed to share.

### 3.2 Google Form [HUMAN] — exact questions
1. **Area / locality** (dropdown; options = `name` values from `public/localities.json`, plus "Other")
2. Nearby landmark (short text, optional; not imported, just for the owner's sanity checks)
3. **Type of home** (Flat / House / 1RK / Room / PG)
4. **Bedrooms** (1 / 2 / 3 / 4 / 5+ / Not applicable)
5. **Monthly rent in ₹** (number)
6. **Furnishing** (Unfurnished / Semi / Furnished)
7. **Gated society?** (Yes / No)
8. Does it waterlog in the monsoon? (No / Road only / Water comes in / Not sure)
9. **Consent** (required checkbox): "I agree this rent can be shown anonymously on a public map of Guwahati rents (no name, no contact, approximate location only)."

Do **not** collect names, phone numbers, emails or exact addresses.

### 3.3 Import script — `scripts/import-survey.ts`
- Run locally only: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/import-survey.ts responses.csv [--dry-run]`
- The key comes from the environment at run time. **Never commit it, never write it to a file in the repo.** The script refuses to run if the key looks like a publishable key.
- For each row:
  1. Skip if consent isn't "yes", or if the locality is "Other" or unknown.
  2. Map labels to enums (House → `independent`, Not applicable → `bhk = 0`, etc.).
  3. Apply `rentProblem()` from `_shared/rules.ts`; skip and log failures.
  4. Location = the locality centre plus a **deterministic jitter of at most 150 m** (seeded from `import_ref`, so re-runs place the pin identically), then round to 3 dp. Set `location_approx = true`.
  5. `import_ref = sha256(timestamp + all answers)`. Upsert with `on conflict (import_ref) do nothing`, so re-importing the same CSV adds nothing.
  6. `source = 'survey'`, `kind = 'rent'`, random `edit_token_hash` (nobody can delete these via the UI; the owner deletes via SQL).
- Print a summary: imported / skipped (with reason counts). `--dry-run` writes nothing.
- No new npm dependencies: parse CSV with a small, quoted-field-aware parser, and test it on fields containing commas.

### 3.4 Frontend
- Pin card: when `location_approx` is true, show "**Approximate location** (area centre)" in place of the exact building feel; when `source = 'survey'`, show "Shared via survey" in the fine print.
- `src/types.ts`: add `source` and `location_approx` to `PublicPin`; add both to `PIN_COLUMNS` in `api.ts`.

### 3.5 Acceptance
- [ ] `--dry-run` on a sample CSV prints the correct counts and writes nothing
- [ ] Real run imports rows; running it again imports 0
- [ ] Rows without consent or with implausible rents are skipped and logged
- [ ] Imported pins show "Approximate location" and "Shared via survey"
- [ ] `git grep -n "service_role\|sb_secret_"` shows no keys committed

---

## 4. Phase 2 — Trust, stats, filters, waterlogging layer, list view

(SPEC §15 Phase 2, updated.)

### 4.1 Report a rent pin
- `report-pin` function (SPEC §7.3): Turnstile, `reporter_hash = sha256(browserId + HASH_SALT)`, unique per pin per reporter, 10/day. Reasons: fake rent, broker/ad, rented out, spam, other.
- Pin card: a **Report** button opens a small reason picker. 3 reports from different browsers → pin hidden (view already filters `report_count < 3`).

### 4.2 Rent double-check step
- When a locality has ≥ 5 pins and the entered rent is **> 2× its median**, show "That's higher than most rents near here (median ₹X). Is it correct?" with **Yes, submit** / **Let me fix it**. Fetch medians from `public_stats_locality`, cached per session.

### 4.3 Filters (`#dlg-filters`, `src/filters.ts`, `src/state.ts`)
- Type (rent data / To-Let boards), BHK (1RK, 1, 2, 3, 4+), rent range, furnishing, gated, property type, hide "water comes in", posted within (30 days / 6 months / **18 months (default)** / all).
- Filter state lives in the URL query string (shareable). Filters rebuild the **source data** (so cluster counts match), not just `setFilter`.
- A visible "Filters (n)" button with the active count; a **Clear all** button.

### 4.4 Stats (`#dlg-stats`)
- City medians by BHK × gated from `public_stats_city`; locality medians from `public_stats_locality`. **Medians only.** Never show a bucket with fewer than 3 pins (the views already enforce it).
- **Recency (§1b):** add migration `0005_stats_recency.sql` that recreates `public_stats_city`, `public_stats_locality` and `area_stats()` with an extra condition `created_at > now() - interval '18 months'`. Keep the existing grants and `having count(*) >= 3`. Re-run the security gate after.
- "Near me / this area" uses `area_stats()` on the current map bounds.

### 4.5 Waterlogging layer
- Toggle button "Monsoon waterlogging". Separate source of pins with `waterlogging != 'unknown'`; heatmap weight none=0, road_only=0.5, enters_premises=1. A legend explains the colours. Hidden by default.
- This is the Guwahati differentiator: give the toggle a clear, prominent place.

### 4.6 Accessible list view (required)
- "Map / List" toggle. A `<table>` with `<caption>`, sortable headers using `aria-sort`, columns: area, home, rent, furnishing, gated, monsoon, posted. Same filtered data as the map.
- Fully usable with keyboard and screen reader. It's also the fast path on low-end phones.

### 4.7 Edit your own pin
- `edit-pin` gains `action: 'update'` (rent, furnishing, optional fields) with the same token check and the same validation as `submit-pin`.

### 4.8 Acceptance
- [ ] 3 reports → pin gone; the same browser reporting twice counts once
- [ ] Filters change map + list; the filtered URL reopens the same view
- [ ] Stats never show a bucket with < 3 pins, and ignore pins older than 18 months
- [ ] Default map view hides rent pins older than 18 months; "Posted within → All" shows them
- [ ] Waterlogging toggle shows/hides the heatmap; legend present
- [ ] List view: keyboard-only and screen reader (VoiceOver/TalkBack) pass
- [ ] Lighthouse mobile: Performance ≥ 80, Accessibility ≥ 95
- [ ] Security gate still all PASS

---

## 5. Not now (explicitly out of scope until ~300 real pins)
Owner listings, seeker matching and emails (Phase 3: needs a custom domain for Resend) · SEO locality pages (Phase 4) · OCR of board phone numbers · AI moderation · comments, ratings · "watch this area" alerts.
