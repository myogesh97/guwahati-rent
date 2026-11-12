# Security audit report: guwahati-rent

**Date:** 2026-11-05 · **Scope:** working tree, all 12 commits of Git history (all refs), `dist/` production build, Supabase migrations and Edge Functions as written in the repo, `netlify.toml`, dependencies.
**Method:** local only. No repository content or secret was sent to any external service. Secret values are redacted throughout; matches are reported by type, file and length only.
**Not available:** live Supabase project and Netlify dashboard; everything that depends on them is marked **NOT VERIFIED**. Browser checks used headless Chrome against a local production build (§14).

> **Update (same day):** every finding below has been fixed in code; see §11. Nothing is deployed yet, so the fixes are not live until the deploy steps in §12 are run. Until then, don't commit this file: it describes abuse paths that are still open on the live site.

---

## 1. Executive summary

**Can someone inspecting the public GitHub repository…**

| Question | Answer | Basis |
|---|---|---|
| …obtain a credential? | **No.** | No private credential exists in any tracked file, in any of the 12 commits, or in the production bundle. `.env` is gitignored and has never been committed, and it contains only public values. Server secrets (`TURNSTILE_SECRET_KEY`, `HASH_SALT`, `CRON_SECRET`, service-role key) are read only through `Deno.env` inside Edge Functions, and cron secrets come from Supabase Vault at run time. |
| …access private database information? | **No, as written in the migrations.** Live state is NOT VERIFIED. | All tables have RLS on with no anon policies. Everything is revoked from `anon`/`authenticated` (including default privileges), and anon gets only 5 column-limited views plus `area_stats()`. Private columns (contacts, tokens, hashes, report messages, private photo paths) never appear in a public view. You still need to run `npm run security-check` against the live project to confirm what is actually deployed. |
| …bypass public form protections? | **Partly, on the live site today.** Fixed in code (M-1, M-2), not yet deployed. | Turnstile is verified server-side on every public form and fails closed. But the rate limits rely on client-controlled values (M-2), and 3 cheap reports can hide any pin or **permanently delete** any To-Let board (M-1). |
| …discover sensitive user data? | **No real user data is in the repo.** M-3 is fixed in code, not yet deployed. | No real rows, emails or phone numbers are committed; the only one is the synthetic `leak-test@example.com` fixture. Two caveats: free-text notes are published unfiltered, so users can publish phone numbers (M-3), and the commit author email is a personal Gmail address (I-2). |

**Findings:** 0 critical · 0 high · 4 medium · 6 low · 9 info. **All fixed in code** except L-5 (waiting on an upstream lint-tooling release) and the commit email (I-2, your choice). Fixes to Edge Functions and the database take effect only after deployment (§12).

| Area | Result |
|---|---|
| Secrets in working tree | PASS |
| Secrets in Git history | PASS |
| Environment files / `.gitignore` | PASS |
| Frontend bundle | PASS |
| Supabase RLS / grants (as written) | PASS |
| Supabase RLS / grants (live) | NOT VERIFIED |
| Edge Functions: auth and validation | PASS |
| Turnstile server-side verification | PASS |
| Abuse resistance (rate limits / reports) | FAIL → **fixed in code**; M-2 needs the live IP check (§12) |
| Public-data privacy (free text) | FAIL → **fixed in code** (M-3) |
| Netlify headers | FAIL → **fixed**: enforced CSP, tested in Chrome |
| Application XSS / DOM | PASS |
| Dependencies | FAIL → **fixed** (only lint-tooling moderates remain) |

---

## 2. Repository exposure findings

- 145 tracked files. There are no backups, archives, certificates, key files, dumps or screenshots (only the map sprite PNGs). `.v1-backup.tar.gz` is gitignored and was never committed.
- Docs (`SPEC.md`, `NEXT-PHASES.md`, `PROJECT_CONTEXT.md`, `CLAUDE.md`) are internal design notes. They name the security model in detail, which is fine because the model doesn't depend on secrecy.
- The Supabase project URL (project ref) appears in `supabase/migrations/0005_tolet_cron.sql:6` (a comment), `NEXT-PHASES.md:167,183` and, since the CSP fix, `netlify.toml`. It is **public by design**: it ships in the frontend bundle anyway (I-1).
- Emails in tracked files: only `@example.com`, `@email.com` and `@yourdomain.in` placeholders. No Indian mobile numbers or IP addresses.
- Commit metadata: all 12 commits use a personal `@gmail.com` author address (I-2).

## 3. Environment file audit

| File | Tracked | Ever in history | Contents |
|---|---|---|---|
| `.env` | No (`.gitignore:3`) | **Never** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (an `sb_publishable_` key, 46 chars), `VITE_TURNSTILE_SITE_KEY` (24 chars), `VITE_SITE_URL`. All four are public config. |
| `.env.example` | Yes | Yes | Placeholders only (empty values or `<…>`), verified as not equal to the real `.env` values. Server secrets appear only as commented-out names. |

There are no nested `.env*` files, `*.pem`, `*.key` or `id_rsa` files anywhere outside `node_modules`. `.gitignore` covers `.env`, `.env.*` (with `!.env.example`), `dist`, `node_modules`, `supabase/.temp` and `.DS_Store`. **PASS.**

## 4. Git history findings

Gitleaks and trufflehog aren't installed, so I ran an equivalent regex scan with `git grep` over **every blob of every commit on all refs**. The patterns were: JWTs, `sb_secret_`, `sb_publishable_`, Resend `re_…`, Turnstile `0x4AAA…`, `postgres://user:pass@`, PEM private keys, GitHub/Netlify/AWS/Slack/OpenAI tokens, `service_role` assignments and project URLs.

- **Credentials found in history: none.** The only hits were the public project URL (I-1).
- The only file ever deleted is `src/ui/results.ts` (UI code).
- Only one personal-data-shaped string has ever appeared in any diff: the synthetic fixture `leak-test@example.com` / `9999999999`.
- No rotation or history rewrite is needed.

**PASS.**

## 5. Frontend bundle findings

`npm run build`, then a scan of `dist/`:

- **Source maps: none** (Vite default `build.sourcemap: false`). Recommended policy: keep them off in production. If you ever need them for error tracking, use `'hidden'` and upload them to the tracker, never to `dist/`.
- **Embedded values:** the publishable key (1 file), the Turnstile site key (1 file) and the project URL. All public.
- Pattern hits that turned out not to be secrets:
  - `sb_secret_` is supabase-js's own key-prefix check.
  - `re_pre…` is MapLibre's `maplibre_preloaded_worker_pool`.
- **Demo mode:** the `src/demo` code is absent from `dist` (0 matches), as intended by the `import.meta.env.DEV` guard.
- `public/.DS_Store` was being copied into local builds. Netlify's clean checkout wouldn't include it (it's gitignored), but a local `netlify deploy --dir dist` would have. It has been removed (I-5).
- Every `import.meta.env` read is a `VITE_*` public value in `src/config.ts`. No server secret is referenced in `src/`.

**PASS.**

## 6. Supabase security findings (static review of migrations 0001–0007 and all 8 Edge Functions)

| Requirement | Result | Evidence |
|---|---|---|
| Anon has no unrestricted access to private data | PASS (as written) | `0001_init.sql:182-191` RLS on all tables with no policies. `0004:31` and `0006:25` add RLS on the new tables. `0001:375-382` revokes everything, including default privileges. `0001:386-389` grants only the views and `area_stats`. |
| Anon cannot write to protected tables | PASS (as written) | No INSERT/UPDATE/DELETE grant to anon anywhere. All writes go through Edge Functions using the service-role client (`_shared/supabase.ts`). |
| Public writes pass through Edge Functions | PASS | `submit-pin`, `edit-pin`, `report-pin`, `tolet-upload-url`, `submit-tolet` and `report-tolet` all use Zod schemas plus server checks. |
| Service role never in frontend | PASS | It appears only in `supabase/functions/_shared/supabase.ts` (from `Deno.env`) and in the bundle scan (§5). |
| Raw pin/contact info not public | PASS | `public_pins` (`0004:66`) lists safe columns explicitly. It has no `email`, `phone`, `edit_token_hash`, `report_count`, `status` or `import_ref`. `pin_contacts` has no anon grant. |
| Storage: no unintended public access | PASS (as written) | `tolet` is private, with no storage policies for anon (uploads use signed URLs only). `tolet-public` holds admin-approved copies only. Both buckets: 512 KB, `image/webp` or `image/jpeg` only (`0004:54`). |
| Stats need n ≥ 3 | PASS | `having count(*) >= 3` in `public_stats_city`, `public_stats_locality` and `area_stats` (`0007:14,27,38`). Small `area_stats` boxes reveal nothing extra, because individual pins are already public (I-7). |
| Coordinates ~100 m | PASS | `submit-pin` stores `round3()` coordinates (`toWkt`), so the raw table never holds finer data. Seeker dots use 2 dp. To-Let boards use 4 dp (~11 m) **by design** (NEXT-PHASES §2a.4: a board is a public sign at a public spot) (I-8). |
| `SECURITY DEFINER` hygiene | PASS | Every definer function sets `search_path`. Internal ones (`hit_rate_limit`, `run_matching`, `cleanup`, `flag_outliers`, the bump triggers) are revoked from anon. |
| Admin endpoint | PASS | `admin-review` verifies the bearer token with `auth.getUser()` server-side, then checks the `admins` table, so `verify_jwt = false` is safe here. `tolet-maintenance` requires `x-cron-secret` (constant-time compare). |
| Edit tokens | PASS | 256-bit `crypto.getRandomValues` token; only its SHA-256 is stored; constant-time compare; the same error for "no such pin" and "wrong token". |
| CORS | PASS | Allow-list from `ALLOWED_ORIGINS`. CORS isn't the access-control boundary here anyway (auth is by token, Turnstile or admin JWT). |
| **Live state** | **NOT VERIFIED** | Whether the migrations are actually applied: per CLAUDE.md, 0006/0007 are not deployed yet. Also unchecked: Vault secrets, Edge Function secrets, live bucket limits. **Run `npm run security-check`** (it already tests all of the above with the anon key). |

## 7. Netlify deployment findings

Before this audit, `netlify.toml` set only `nosniff`, `Referrer-Policy` and `Permissions-Policy`.

| Header | Before | Now |
|---|---|---|
| Frame protection (`X-Frame-Options`, CSP `frame-ancestors`) | missing: `/admin.html` could be framed (M-4) | **`DENY` + `frame-ancestors 'none'` enforced** |
| Strict-Transport-Security | not set in repo | `max-age=31536000` (no `includeSubDomains`/`preload`, so it can't affect other subdomains) |
| Content-Security-Policy | missing | **Enforced** policy built from the app's actual origins and tested in headless Chrome (I-3) |

The report-only policy only logs violations and never blocks anything. It allows exactly:

- `self`
- `https://*.supabase.co` (API and public To-Let photos)
- `https://challenges.cloudflare.com` (Turnstile script and iframe)
- `blob:` (the MapLibre worker and photo previews)
- `data:` images (one CSS image)
- inline styles (13 `style=""` attributes in `index.html`)

There are no third-party fonts or scripts. Map tiles, glyphs and sprites are same-origin.

No redirects, functions or debug endpoints are configured. `admin.html` is public but useless without an admin login, and it has `noindex`. Deploy previews and branch deploys are dashboard settings: **NOT VERIFIED**. Only public `VITE_*` values are needed at build time, so a preview build can't leak a secret.

## 8. Turnstile and form security findings

| Check | Result |
|---|---|
| Server-side verification | PASS: `_shared/turnstile.ts` posts to `siteverify` and accepts only `success === true`. |
| Secret only on the server | PASS: `Deno.env.get('TURNSTILE_SECRET_KEY')`; it throws (so the request fails) if unset. |
| Frontend has only the site key | PASS |
| Token reuse | PASS: Cloudflare's `siteverify` rejects a token that was already redeemed. |
| Missing or invalid token rejected | PASS: Zod `min(1)`, then a 403 if verification fails. |
| Forms covered | Pin your rent (`submit-pin`) ✔, report pin ✔, To-Let upload URL ✔, To-Let gone report ✔. `edit-pin` needs the pin's edit token instead. `submit-tolet` needs the board id plus the uploader's browser id from the Turnstile-gated step. |
| Rate limiting | Present on every public function, keyed on both IP and browser id. But both keys are client-influenced (**M-2**). |
| Server-side validation | PASS: strict Zod schemas, enum lists, numeric bounds, text length caps and cross-field rules (`_shared/pin-fields.ts`, `_shared/rules.ts`). |
| Upload abuse | PASS: signed upload URLs for fixed paths, bucket size and MIME limits, and `submit-tolet` re-checks size and MIME before queueing. Nothing is public before admin approval. See L-3 for EXIF. |
| `hostname`/`action` checked on the token | No (L-4). |

## 9. Application vulnerability findings

- **XSS: PASS.** Every `innerHTML` template was reviewed (`pin-card.ts`, `list-view.ts`, `stats.ts`, `admin.ts`, `main.ts`). All user text goes through `escapeHtml` (`society_name`, `one_liner`, both notes via `row()`, report messages, locality names, signed URLs in admin). Enum labels come from fixed maps keyed by server-validated values. There is no `eval`, `new Function`, `document.write`, MapLibre `setHTML` or `Popup`.
- **URLs / redirects: PASS.** No open redirects. The only dynamic links are `wa.me` with an `encodeURIComponent`'d text, OSM links built from numbers, and storage URLs built from encoded path segments.
- **postMessage:** not used. **SQL injection:** not possible. Only supabase-js query builders are used, and the one `.or()` filter (`tolet-maintenance`) interpolates server-generated ISO dates only.
- **Error messages: PASS.** Clients get a generic 500 message. Logs record `e.message` and the names of fields that failed validation, never their values.
- **localStorage: acceptable.** It holds edit tokens and the browser id by design (SPEC §5.8). Only an XSS could steal them, and none was found. Enforcing the CSP (I-3) would harden this further.
- **Randomness: PASS.** Security values use `crypto.getRandomValues` / `crypto.randomUUID`. `Math.random` appears only in the dev-only demo data.

## 10. Dependency audit

`npm audit` before: **1 critical, 3 high, 7 moderate**.

| Package | Severity | Where | Status |
|---|---|---|---|
| `vite` 6.4.3 (launch-editor, `fs.allow`, middleware) | high | dev server only | **Fixed**: 6.4.5 via `npm audit fix` (no `--force`) |
| `source-map-js` (DoS) | high | build tooling | **Fixed** |
| `zod` (frontend `package.json`) | high | unused in `src` | **Removed** (the Edge Functions use their own `npm:zod@3`; see L-1) |
| `browser-image-compression` | none | unused (photos use native canvas) | **Removed** |
| `maplibre-gl` 5.24.0, GHSA-jrc7-96c5-q579 (XSS bypass in `DOM.sanitize`) | critical (advisory) / **low in this app** | production | Open: the fix is 6.x (major). The app passes no untrusted HTML to MapLibre (no popups; attribution is fixed in code). Upgrade after testing (L-6). |
| `typescript-eslint` → `minimatch` (glob DoS) | moderate | lint only, never shipped | Open; harmless |

`npm audit` after: **1 critical (maplibre), 7 moderate (lint chain)**. Install scripts are `esbuild` (×2) and optional `fsevents`, all expected and dev-only.

---

## Findings register

| ID | Sev | File / location | Issue | Impact | Fix | Status |
|---|---|---|---|---|---|---|
| **M-1** | MEDIUM | `supabase/functions/report-tolet/index.ts:51`, `report-pin/index.ts:51`; triggers `0004:33`, `0006:29`; `tolet-maintenance/index.ts:33` | Reports are deduplicated only per `saltedHash(browserId)`, and the browser id is any string the client sends. 3 reports auto-hide a pin, and 3 "gone" reports hide a board **and `tolet-maintenance` deletes it and its photos overnight**. | With 3 Turnstile solves and 3 made-up browser ids, anyone can hide any pin (until an admin reviews it) or permanently delete any approved board. | (a) also deduplicate and count by a salted IP hash; (b) make `gone_reports ≥ 3` only *hide* a board and queue it for admin review instead of deleting it; (c) optionally raise the threshold. | **FIXED** in code (migration 0008, functions, admin queue); deploy pending |
| **M-2** | MEDIUM | `_shared/crypto.ts:9` (`clientIp`), `_shared/ratelimit.ts` | Rate-limit keys are the **first** `X-Forwarded-For` entry and a client-chosen `browserId`. If Supabase's proxy keeps a client-supplied XFF value, both keys are attacker-controlled. | Daily limits (5 pins, 5 boards, 10 reports) become bypassable. Turnstile is then the only gate (one solve per submission). | Check on the live project what `x-forwarded-for` looks like when you send a forged one. Use the header your platform guarantees (the right-most proxy-appended hop, or a provider-set client-IP header). Treat the browser id as a secondary signal only. | **FIXED** in code; run `scripts/check-client-ip.sh` live to confirm (§12) |
| **M-3** | MEDIUM | `_shared/pin-fields.ts:29` (`optText`) → `one_liner`, `society_name`, `water_note`, `waterlog_note` | Free text is trimmed and length-capped, then published in `public_pins` immediately. Nothing blocks phone numbers or emails; the "don't include phone numbers" warning is client-side text only. | Anyone can publish their own or someone else's (e.g. a landlord's) phone number or email on the public map. That conflicts with the SPEC rule that anon never reads phone or email. | Reject text containing phone-number or email patterns on the server (e.g. 10+ digits after removing spaces and dashes, `+91`, `@`), and mirror the check in the form. | **FIXED** in code (server + form); deploy pending |
| **M-4** | MEDIUM | `netlify.toml` | No frame protection: `/admin.html` and the forms could be embedded in a hostile page (clickjacking). | An admin could be tricked into clicking Approve or Remove. | `X-Frame-Options: DENY` and `frame-ancestors 'none'`. | **FIXED** |
| L-1 | LOW | `_shared/http.ts` (`readJson`); zod 3.25.76 in Edge Functions | No request-size cap, and zod 3 has GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized constrained collections). | Per-isolate memory/CPU DoS with huge JSON bodies. | 32 KB body cap before parsing. Move the functions to zod 4 later. | **FIXED** (cap); takes effect when the functions are redeployed |
| L-2 | LOW | `vite` | Dev-server advisories. | Only matters if `vite --host` runs on an untrusted network. | Upgraded to 6.4.5. | **FIXED** |
| L-3 | LOW | `src/ui/image.ts`; `admin-review` approve copies files unchanged | EXIF/GPS is stripped **only in the browser** (canvas re-encode). The server checks declared MIME and size, not content or metadata. | A modified client could upload a photo with GPS/EXIF, which becomes public once an admin approves it. It would usually be the uploader's own data. | Re-encode or strip metadata server-side on approval, or have admins check before approving. | **FIXED** in code (`_shared/image-check.ts`); deploy pending |
| L-4 | LOW | `_shared/turnstile.ts` | The `siteverify` response's `hostname` (and `action`) isn't checked. | Low: the site key is domain-bound in Cloudflare. | Compare `data.hostname` with the allowed hostnames. | **FIXED** in code; deploy pending |
| L-5 | LOW | `typescript-eslint` → `minimatch` | Moderate advisories in lint tooling. | None in production. | Update when a fixed version lands. | Open |
| L-6 | LOW | `maplibre-gl` 5.24.0 | Critical advisory; low exploitability here (no untrusted HTML reaches MapLibre). | Would matter if popups or custom attribution with user data were ever added. | Upgrade to maplibre-gl 6.x on a branch and test the map. | **FIXED**: maplibre-gl 6.16.0, tested in Chrome |
| I-1 | INFO | `0005_tolet_cron.sql:6`, `NEXT-PHASES.md:167,183` | Real project URL in a comment and in docs. | None: it's public (in the bundle). | Optionally replace with `<ref>`. | n/a |
| I-2 | INFO | Git metadata | Commits are authored with a personal Gmail address, which GitHub shows publicly. | Exposes your personal email. | `git config user.email <id>+<user>@users.noreply.github.com` and enable "Block command line pushes that expose my email". Past commits keep the address unless history is rewritten (not recommended). | Your choice |
| I-3 | INFO | `netlify.toml` | CSP added in **report-only** mode. | Not enforced until it has been tested. | Test in a browser, then promote it to `Content-Security-Policy`. Consider pinning `*.supabase.co` to your exact project host. | **FIXED**: CSP enforced, tested in Chrome |
| I-4 | INFO | `package.json` | Unused `zod`, `browser-image-compression`. | Supply-chain surface. | Removed. | **FIXED** |
| I-5 | INFO | `public/.DS_Store` | Copied into local `dist/`. | Leaks local folder names on a manual CLI deploy. | Deleted (it was gitignored). | **FIXED** |
| I-6 | INFO | `scripts/security-check.sh` | An anon-key live RLS/grant/storage gate already exists. | | Run it after every migration deploy. | n/a |
| I-7 | INFO | `area_stats` | Arbitrary bounding boxes with n ≥ 3. | No extra leak: individual pins are already public. | none | n/a |
| I-8 | INFO | `tolet-upload-url` (`toWkt4`) | Boards are stored at 4 dp. | Intended (a public sign at a public place). | none | n/a |
| I-9 | INFO | `0002_cron.sql` | The `send-digests` cron calls a function that doesn't exist yet (Phase 3). | Daily 404, no exposure. | Unschedule it until Phase 3, or leave it. | n/a |

---

## 11. Fixes implemented (committed in `c258588` and deployed 12 Nov 2026 as `v0.3.0`)

| Finding | Files | Change |
|---|---|---|
| M-1 | `supabase/migrations/0008_report_abuse.sql` (new) | `ip_hash` on `reports` and `tolet_reports`, with partial unique indexes per pin/board, so one IP counts once whatever browser ids it sends. |
| M-1 | `report-pin`, `report-tolet` | Store the salted IP hash (`ipHash()` in `_shared/crypto.ts`); a duplicate IP is answered like a duplicate browser. |
| M-1 | `tolet-maintenance` | No longer deletes boards with 3+ "gone" reports. They stay hidden (public view, unchanged) until an admin decides. |
| M-1 | `admin-review`, `admin.html`, `src/pages/admin.ts` | New "Reported gone" queue on the boards tab: `list_gone`, `keep_board` (back on the map; old report rows stay, so the same people can't hide it again), `remove_board` (status `gone`; files deleted overnight). Both are written to `moderation_log`. |
| M-2 | `_shared/crypto.ts` | `clientIp()` prefers `cf-connecting-ip`, then `x-real-ip`, then the first `x-forwarded-for` entry, and a `CLIENT_IP_HEADER` secret can pin it to one header. |
| M-2 | `supabase/functions/ip-check/` (new, temporary), `scripts/check-client-ip.sh` (new), `config.toml` | A CRON_SECRET-protected diagnostic plus a script that sends forged headers and reports whether the chosen IP can be spoofed. Delete the function after use. |
| M-3 | `_shared/rules.ts` (`hasContactInfo`, `contactProblems`), `_shared/pin-fields.ts` (`checkPin`), `src/forms/rent-pin.ts` | Society name, both notes and the one-liner are rejected if they contain an email or an Indian phone number (mobile with or without +91/0 and spacing, or an STD landline). This applies to submit and edit, on the server and in the form. The rule is tested against everyday rent text (ranges like 12000-15000, flat numbers, years) to avoid false positives. |
| L-1 | `_shared/http.ts` | Request bodies over 32 KB are refused before parsing. |
| L-3 | `_shared/image-check.ts` (new), `submit-tolet` | The server downloads both uploads and rejects them if the bytes aren't the declared WebP/JPEG or if they carry GPS EXIF, XMP or IPTC. Checked against real Chrome canvas output (passes). |
| L-4 | `_shared/turnstile.ts` | A token is accepted only if Cloudflare reports a hostname listed in `ALLOWED_ORIGINS`. If that secret is unset, there's no hostname check, as before. |
| L-6 | `package.json`, `src/map.ts`, `netlify.toml` | maplibre-gl 5.24 → 6.16. Namespace import; the worker is emitted by Vite (`?url` + `setWorkerUrl`), because MapLibre 6 otherwise looks for a file Vite never copies, which would break the map in production. `.mjs` is served as `text/javascript`. |
| I-3, M-4 | `netlify.toml` | **Enforced** CSP pinned to the exact Supabase host, plus `frame-ancestors 'none'`, `X-Frame-Options: DENY` and HSTS. |
| L-2, I-4, I-5 | `package.json`, lockfile, `public/.DS_Store` | vite 6.4.5; unused `zod` and `browser-image-compression` removed; `.DS_Store` deleted. |

No RLS, grants, credentials, production environment variables, dashboard settings or Git history were touched, and nothing was deployed.

**MapLibre 6 caveat:** it needs WebGL2, which practically every phone from the last ~8 years supports. On a device without it, the map won't draw, but the list view and the forms still work.

## 12. Deploy steps (done 12 Nov 2026; kept for the record. The M-2 probe now uses `scripts/diagnostics/ip-check/`)

I didn't deploy. CLAUDE.md says migrations 0006/0007 (Phase 2) are built but not deployed, and 0008 depends on 0006. Pushing migrations therefore ships Phase 2 as well, and the updated `report-*` functions fail until 0008 is applied. That's a release decision for you.

1. `npx supabase db push`: applies 0006, 0007 and 0008. Then run `npm run security-check` (the anon-key gate).
2. `npx supabase functions deploy`: deploys all functions, including the temporary `ip-check`.
3. `CRON_SECRET=… bash scripts/check-client-ip.sh`. If it reports FAIL, run `npx supabase secrets set CLIENT_IP_HEADER=<header it suggests>`. Then run `npx supabase functions delete ip-check`, and delete `supabase/functions/ip-check/` and its `config.toml` entry.
4. Check that `ALLOWED_ORIGINS` contains every site origin (production, plus any preview URLs you use), because Turnstile tokens are now tied to those hosts.
5. Commit and push. Netlify then serves the new headers, the CSP and MapLibre 6.
6. After the deploy: open the live site and `/admin.html`, and check the browser console for CSP errors. Then pin a test rent with a phone number in the one-liner; it should be refused.

## 13. Remaining risks

- Live database state, secrets and Netlify dashboard settings are still unverified until step 1 and `npm run security-check`.
- M-2 is fixed in code, but it only becomes safe once the live check confirms the chosen header can't be forged.
- Turnstile solving farms remain a cost to an attacker, not a wall. Reports now need distinct IPs as well, and boards are never deleted without an admin.
- The phone/email filter is pattern-based. Deliberately disguised numbers ("nine eight six…") still get through; the reporting flow and admin removal cover those.
- `typescript-eslint` → `minimatch` moderates (lint only) until upstream ships a fix.
- `'unsafe-inline'` styles stay in the CSP (13 `style=""` attributes). This is low risk: scripts are strict.

## 14. Verification results

| Step | Result |
|---|---|
| Secret scan: working tree, all changed/new files | PASS (one false positive: a MapLibre identifier quoted in this report) |
| Secret scan: all history (12 commits, all refs) | PASS |
| `.env` ignored and never committed | PASS |
| `npm run typecheck` / `npm run lint` | PASS / PASS |
| `npm test` | PASS (32/32, including new contact-info and image-check tests) |
| `deno check` all Edge Functions | PASS (deno 2.9.8) |
| `npm run build` | PASS |
| `dist/` scan: secrets / source maps | PASS (0 / 0) |
| `npm audit` | 7 moderate (lint tooling only); the critical and high advisories are gone |
| **Browser test, enforced CSP** (headless Chrome 156, production build served with the `netlify.toml` headers) | PASS: 0 CSP violations on `/` and `/admin.html`. MapLibre 6 worker loads (WebGL2); basemap, labels, pins and price labels render (screenshot checked); `public_pins`, `public_tolet` and stats load from Supabase; Turnstile script and iframe load and issue a token; cross-origin framing of `/admin.html` is refused. |
| Real canvas WebP/JPEG through `inspectImage` | PASS (`ok`) |
| `npm run dev` serves the MapLibre worker | PASS (200 `text/javascript`) |
| Live RLS / storage / secrets; live XFF behaviour | NOT VERIFIED: deploy steps 1–3 |
| Netlify dashboard (previews, env) | NOT VERIFIED |

`npm audit` passing (or not) was not taken as proof of security. The conclusions rest on the file-by-file review and the tests above.
