# Deploying guwahati-rent

The three deployable parts move independently and **the order matters**: database → Edge Functions → frontend. A function that expects a column the database does not have yet returns 500 on every call.

## 0. Before every release

```bash
npm run typecheck && npm run lint && npm test && npm run test:deno && npm run test:db && npm run build && npm run test:browser
```

## 1. Database (migrations)

```bash
npx supabase db push --linked          # applies every pending file in supabase/migrations/
```

Then in the SQL editor confirm what is applied:

```sql
select version from supabase_migrations.schema_migrations order by version;
```

Migrations are forward-only. There are no down scripts; a mistake is fixed with a new migration, never by editing an applied one.

## 2. Edge Functions

```bash
npx supabase functions deploy --no-verify-jwt   # all functions in supabase/functions/
# or one at a time:
npx supabase functions deploy report-pin --no-verify-jwt
```

Every public function must be in `supabase/config.toml` with `verify_jwt = false` (they do their own Turnstile, rate-limit or token checks, and `sb_publishable_` keys are not JWTs).

Secrets (`npx supabase secrets list` to check names, never values):

| Secret | Used by |
|---|---|
| `TURNSTILE_SECRET_KEY` | submit-pin, report-pin, report-tolet, tolet-upload-url |
| `HASH_SALT` | every function (rate limits, reporter/uploader hashes) |
| `ALLOWED_ORIGINS` | CORS allow-list **and** Turnstile hostname check: every site origin, comma-separated |
| `CRON_SECRET` | tolet-maintenance (and the temporary ip-check diagnostic) |
| `CLIENT_IP_HEADER` | optional; set only if `scripts/check-client-ip.sh` says so |

Vault (SQL editor, once): `project_url`, `cron_secret` (same value as `CRON_SECRET`).

## 3. Frontend (Netlify)

Push to `main`; Netlify builds with `npm run build` and serves `dist/`. Build-time env vars (Settings → Environment variables, **not** marked secret): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_SITE_URL`. `VITE_SITE_URL` is also used for canonical URLs, `og:url`, `robots.txt` and `sitemap.xml`.

If the Supabase project or the site origin ever changes, update together: `netlify.toml` (CSP), `ALLOWED_ORIGINS`, the Turnstile widget's allowed domains, and the Auth redirect URLs for `admin.html`.

## 4. After every release

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<publishable key> npm run security-check
curl -sI https://<site>/ | grep -iE "content-security-policy|x-frame-options|strict-transport"
```

Open the site and `/admin.html` with the browser console open: 0 CSP violations. Pin one test rent (and delete it).

## 5. Rollback

| Part | How |
|---|---|
| Frontend | Netlify → Deploys → pick the previous deploy → **Publish deploy**. Instant. |
| Edge Functions | `git checkout <previous tag or commit> -- supabase/functions && npx supabase functions deploy --no-verify-jwt`, then return to `main`. |
| Database | No automatic rollback. Write a forward migration that reverses the change, or restore from the weekly dump (`.github/workflows/backup.yml` artifacts) with `pg_restore --clean --if-exists --schema=public`. Restoring loses pins added since the dump. |

Tag every production release (`git tag v0.x && git push --tags`) so there is always something to roll back to.

## 6. Pending release (prepared 12 Nov 2026, not deployed)

`v0.3.0` (migrations 0001–0008, all 8 functions, the CSP/SEO frontend) is live. The tree on top of it holds the production-readiness changes in `CHANGELOG.md`. To ship them, follow [NETLIFY_DEPLOYMENT_CHECKLIST.md](NETLIFY_DEPLOYMENT_CHECKLIST.md) §5:

1. `npx supabase db push --linked` → applies `0009_launch_hygiene.sql` (unschedules the Phase 3 cron jobs, fixes the waterlogging share, clears stale outlier flags). Run `npm run test:db` first.
2. `npx supabase functions deploy --no-verify-jwt` → all 8 functions (shared rate-limit and Turnstile changes).
3. Commit, tag, push → Netlify deploys the frontend (map empty state, privacy copy, JSON-LD).
4. §4 of this file, plus the client-IP check: `scripts/check-client-ip.sh` (the diagnostic now lives in `scripts/diagnostics/ip-check/`; copy it in, deploy, run, delete).
