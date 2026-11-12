# Netlify Deployment Checklist

**Updated:** 12 Nov 2026 · **Live:** `v0.3.0` (`91fde5d`): migrations 0001–0008, 8 Edge Functions, CSP/SEO frontend · **Deployed 12 Nov:** migration 0009 + all 8 functions. **Pending:** the frontend changes at the top of [CHANGELOG.md](CHANGELOG.md) (push as `v0.4.0`).
This replaces the earlier audit snapshot of this file. General order and rollback are also in [DEPLOY.md](DEPLOY.md). Launch status: [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md).

**Order is always: database → Edge Functions → frontend.** A function that expects a column the database doesn't have yet returns 500 on every call.

---

## 1. Environment variables

### 1.1 Public frontend config (Netlify → Site configuration → Environment variables)
These end up in the browser bundle **by design**. Don't mark them "secret" in Netlify (its secret scanner then fails the build).

| Variable | Required | Value | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | `https://<ref>.supabase.co` | Must match the host in the `netlify.toml` CSP (`connect-src`, `img-src`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | anon / `sb_publishable_…` key | **Never** the service-role / `sb_secret_` key. Sent only as the `apikey` header. |
| `VITE_TURNSTILE_SITE_KEY` | Yes | Turnstile **site** key | The widget's allowed domains must include every site hostname |
| `VITE_SITE_URL` | Yes | `https://guwahati-rent.netlify.app` (or the custom domain) | Canonical, `og:url`, JSON-LD, `robots.txt`, `sitemap.xml`. A localhost value falls back to the Netlify URL at build time. |
| `VITE_TILES_URL` | No | leave **unset** | Unset = same-origin `/tiles/guwahati.pmtiles`. An external origin also needs a CSP change. |

Variables are baked in at build time: **redeploy after changing any of them.**

### 1.2 Server-side secrets (Supabase → `npx supabase secrets set …`)
**Never** in Netlify, never in a `VITE_` variable, never committed.

| Secret | Used by | Status (12 Nov) |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | submit-pin, report-pin, report-tolet, tolet-upload-url | set |
| `HASH_SALT` | every function (rate limits, reporter/uploader/IP hashes). **Never change it**: that resets every counter and breaks report de-duplication. | set |
| `ALLOWED_ORIGINS` | CORS allow-list **and** the Turnstile hostname check. Every site origin, comma-separated (e.g. `http://localhost:5173,https://guwahati-rent.netlify.app`). | set |
| `CRON_SECRET` | tolet-maintenance; the temporary ip-check diagnostic | set |
| `CLIENT_IP_HEADER` | optional: only if `scripts/check-client-ip.sh` says so | not needed: probe PASS on 12 Nov (`cf-connecting-ip`, not forgeable) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | injected by the platform | automatic |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` | Phase 3 only | not needed yet |

### 1.3 Supabase Vault (SQL editor, once; never in a migration)
`project_url` (`https://<ref>.supabase.co`) and `cron_secret` (same value as `CRON_SECRET`). Read by the `tolet-maintenance` cron job.

### 1.4 GitHub Actions secrets
| Secret | Workflow | Status |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | keepalive | working |
| `NETLIFY_BUILD_HOOK_URL` | nightly-rebuild | working |
| `SUPABASE_DB_URL` | weekly-backup | **working** (run #4, 12 Nov 2026; restore verified). Must be the **Session pooler** string `postgresql://postgres.<ref>:<password>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`. Not the direct `db.<ref>.supabase.co` host (IPv6-only; GitHub runners have no IPv6), and not port 6543. The workflow now names the problem without printing the secret. |

### 1.5 Turnstile (Cloudflare dashboard)
Site key with allowed hostnames = every site hostname (plus `localhost` for dev). The server checks `hostname ∈ ALLOWED_ORIGINS` and `action = submit`.

---

## 2. Supabase setup (one time, already done for the live project)
1. Extensions: `postgis`, `pg_cron`, `pg_net`.
2. Storage buckets `tolet` (private) and `tolet-public` (public), created by 0001 with limits set by 0004 (512 KB; `image/webp`, `image/jpeg`).
3. Auth → URL configuration: Site URL = the site; Redirect URLs include `https://<site>/admin.html` and `http://localhost:5173/admin.html`.
4. Admin: sign in once on `/admin.html`, then `insert into admins (user_id) select id from auth.users where email = '<you>';`
5. **Never** add RLS policies, never disable RLS, never grant anon INSERT/UPDATE/DELETE (SPEC §5).

---

## 3. Migration requirements

| Migration | Live? | What it does | Reversible? |
|---|---|---|---|
| 0001–0008 | yes | schema, cron, conditions, To-Let, moderation, stats recency, report abuse | forward-only |
| **0009_launch_hygiene** | **no** | unschedules `send-digests` and `run-matching`; recreates `public_stats_locality` (waterlogging share over answered rents only; same columns and grants); replaces `flag_outliers()` (clears stale flags) | yes (§8.3) |

Before applying, run `npm run test:db` locally. It applies 0001–0009 to a throwaway database and checks grants, RLS and stats (80 checks).

---

## 4. Edge Function deployment

All 8 public functions are deployed with `--no-verify-jwt` and listed in `supabase/config.toml` with `verify_jwt = false`. Each one does its own Turnstile, token or admin check, and `sb_publishable_` keys aren't JWTs.

This release changes the shared helpers `_shared/crypto.ts`, `_shared/ratelimit.ts` and `_shared/turnstile.ts`, so **all 8** must be redeployed:
```bash
npx supabase functions deploy --no-verify-jwt
npx supabase functions list           # 8 ACTIVE, new versions, verify_jwt=false
```
**Never** leave `ip-check` deployed. It lives in `scripts/diagnostics/` and is copied in only for the check in §6.

---

## 5. Build and deploy this release

Run locally first. Every command below must pass:
```bash
npm ci
npm run typecheck && npm run lint && npm test && npm run test:deno && npm run test:db && npm run build
npm run test:browser        # headless Chrome, writes to Supabase blocked
```

Then, **in this order** (each step needs your approval; none were done by this work):

1. **Backups first** (§1.4): fix `SUPABASE_DB_URL`, run Actions → `weekly-backup` → Run workflow, and confirm an artifact exists.
2. **Database:**
   ```bash
   npx supabase db push --linked          # applies 0009 only
   npx supabase migration list --linked   # 0001–0009 local = remote
   ```
   SQL editor: `select jobname from cron.job order by 1;` → `cleanup`, `flag-outliers`, `tolet-maintenance`.
3. **Functions:** §4.
4. **Frontend:**
   ```bash
   git add -A && git commit -m "Production readiness: rate-limit/Turnstile hardening, 0009, empty state, tests"
   git tag -a v0.4.0 -m "Production readiness"
   git push origin main --tags            # Netlify builds npm run build -> dist
   ```
5. **Post-deployment checks:** §7.

Netlify settings are unchanged: build `npm run build`, publish `dist`, `NODE_VERSION = 22`. No SPA redirect is needed: it's a multi-page app, and unknown paths correctly return 404. Headers come from `netlify.toml`: enforced CSP, `X-Frame-Options: DENY`, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, immutable `/assets/*`, `/tiles/*` with `Accept-Ranges`, `.mjs` served as JavaScript. No source maps are emitted.

---

## 6. Client-IP check (once, after step 3)
```bash
cp -r scripts/diagnostics/ip-check supabase/functions/ip-check
npx supabase functions deploy ip-check --no-verify-jwt
CRON_SECRET=<value> bash scripts/check-client-ip.sh
npx supabase functions delete ip-check && rm -rf supabase/functions/ip-check
```
- **PASS:** nothing to do.
- **FAIL:** run `npx supabase secrets set CLIENT_IP_HEADER=<header the script names>`, redeploy the functions (§4), and re-run the check.

The function returns booleans only, never an IP address.

---

## 7. Post-deployment smoke tests

Use the live site on a **real phone**, with the browser console open on a laptop as well. Write down the date and the results.

**Headers and console**
- [ ] `curl -sI https://<site>/ | grep -iE "content-security-policy|x-frame-options|strict-transport"` shows all three
- [ ] 0 CSP violations on `/` and `/admin.html` (Netlify's injected badge is the known exception until it is turned off)
- [ ] `/robots.txt`, `/sitemap.xml`, `/og-default.png` → 200; view-source shows the JSON-LD with the real site URL

**Security gate:** insert the test rows from the header of `scripts/security-check.sh`, then:
- [ ] `SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run security-check` → ALL PASS
- [ ] delete the test rows

**Write paths** (delete everything afterwards)
- [ ] Pin a test rent: Turnstile → submit → pin appears → share dialog
- [ ] A phone number in the one-liner → refused with a clear message
- [ ] Edit that pin → "Saved" → refresh → change persists
- [ ] From a second browser: no Delete button on that pin
- [ ] Delete it from the first browser → gone after refresh
- [ ] Report a pin from 3 browsers on 3 networks → hidden. Admin **Keep** → back. Report again ×3 → admin **Remove** → gone.
- [ ] Same browser reports twice → "You've already reported this"
- [ ] Spot a To-Let: photo → location → submit → appears in `/admin.html` → **Approve** → on the map. **Reject** another → its files are gone from Storage.
- [ ] "Board is gone" ×3 → hidden → admin **Keep** / **Remove**
- [ ] Logged in as a non-admin → `admin-review` returns 403
- [ ] Map/List, Filters (the URL changes; reopening the URL restores the view), Stats, Monsoon toggle, empty state (`/?min=490000`)

**Backend**
- [ ] `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 20;` shows successful `cleanup`, `flag-outliers`, `tolet-maintenance`
- [ ] Function logs: no `rate-limit: client IP unknown` warnings (if there are any, run §6)
- [ ] First scheduled `weekly-backup` (Sunday 03:30 IST) is green

---

## 8. Rollback

| Part | How | Notes |
|---|---|---|
| Frontend | Netlify → Deploys → previous deploy → **Publish deploy** | Instant. The `v0.3.0` frontend works with 0009 (same view columns). |
| Edge Functions | `git checkout v0.3.0 -- supabase/functions && npx supabase functions deploy --no-verify-jwt && git checkout main -- supabase/functions` | Restores the shared-bucket rate limit and drops the action check |
| Database (0009) | Forward fix in a new migration. To restore the exact previous behaviour, see §8.3. | No data is changed by 0009, so there's nothing to restore from a backup |
| Database (anything worse) | `pg_restore --clean --if-exists --schema=public` from the latest `weekly-backup` artifact | Loses pins added since the dump. Restore verified on 12 Nov 2026 (run #4). The dump is `public` only: into a **new** project, the `admins` / `moderation_log` rows fail their `auth.users` foreign keys, so sign in on `/admin.html` and re-insert your `admins` row. |

### 8.3 Reverting 0009 (new migration, e.g. `0010_revert_0009.sql`)
```sql
-- Re-schedule the Phase 3 jobs exactly as 0002 did (send-digests is harmless but 404s daily).
select cron.schedule('run-matching', '30 20 * * *', $$select public.run_matching()$$);
-- Restore the 0007 versions of the view and function: copy public_stats_locality from
-- 0007_stats_recency.sql and flag_outliers() from 0001_init.sql verbatim, then re-grant:
-- grant select on public.public_stats_locality to anon, authenticated;
```

Tag every production release (`git tag -a v0.x`) so there is always a named rollback point. `v0.3.0` exists.
