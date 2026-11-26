# Threat model (STRIDE, lightweight)

Scope: the three data flows that carry personal or moderated data. 26 Nov 2026, `main` @ `518e60e` plus the `wrap/release-audit` branch.

**Assets.** Pin rows (rent, location to ~110 m, free-text note, society name, exact size), report notes, To-Let photos before review, edit tokens, salted IP and browser hashes, consent timestamps, the admin account, the service-role key, `HASH_SALT`, `CRON_SECRET`, weekly DB dumps.

**Trust boundaries.** Browser ↔ Netlify · Browser ↔ PostgREST (anon key) · Browser ↔ Edge Functions · Edge Functions ↔ Postgres/Storage (service role) · pg_cron ↔ Edge Functions · GitHub Actions ↔ Postgres (DB URL) · GitHub artifact store ↔ the internet.

## Flow 1: submit / edit / delete a rent pin

Browser → `submit-pin` / `edit-pin` → `pins`; public read via `public_pins`.

| STRIDE | Threat | Control (evidence) | Residual |
|---|---|---|---|
| S | Bot or scripted mass submission | Turnstile verified server-side with hostname and action check (`_shared/turnstile.ts:20-40`); 5/day per IP hash and per browser hash (`_shared/ratelimit.ts`) | Browser id is client-chosen; the IP counter is the real limit. Pin `CLIENT_IP_HEADER` so `x-forwarded-for` can't be spoofed (`_shared/crypto.ts:12`). Low |
| T | Editing someone else's pin | `edit-pin` needs the 32-byte edit token; sha256 compared in constant time; same 403 for "not found" and "wrong token" (`edit-pin/index.ts:55`) | None found |
| T | Fake or extreme rents skewing medians | Plausibility bands (`_shared/rules.ts`), outlier flag (`flag_outliers`), medians only, groups of 3+, 3-report auto-hide | Coordinated low-volume poisoning is possible; acceptable for a crowdsourced map |
| R | Submitter denies posting abuse | `consented_at` stored; IP/browser hashes in `rate_limits` for 2 days only | By design (anonymity) |
| I | Re-identifying a renter from public fields | 3 dp rounding; society name only with 3+ pins within 300 m; size as a band (`0010_privacy_k_anon.sql`); PII filter on text (`_shared/pii.ts`) | Free text can still hold identifying prose that the filter misses. Moderation-dependent |
| I | Archived (deleted) pins retained forever | None. `edit-pin` delete only sets `status='archived'` (`edit-pin/index.ts:64`); `cleanup()` never removes pins | **Open P1 (PW-26)** |
| D | Large or malformed bodies | 32 KB body cap, zod schemas (`_shared/http.ts:27`) | Supabase free-tier quotas are the real ceiling |
| E | anon writing directly to tables | All tables revoked from anon/authenticated; RLS on, no policies (`0001_init.sql:375-392`); verified live by `security-check.sh` (65/66, the 1 is a seed-row precondition) | None found |

## Flow 2: To-Let photo upload and moderation

Browser → `tolet-upload-url` (signed URLs) → Storage `tolet/pending` → `submit-tolet` → admin approves in `admin-review` → copy to `tolet-public` → `public_tolet`; `tolet-maintenance` (cron) expires.

| STRIDE | Threat | Control | Residual |
|---|---|---|---|
| S | Non-admin calls `admin-review` | Bearer token → `auth.getUser` → row in `admins` required, before parsing (`admin-review/index.ts:37-52`) | Admin account security = email inbox security (magic link). Medium |
| T | Polyglot or malicious file | Bucket MIME + 512 KB limits; magic-byte check and EXIF/GPS/XMP rejection (`_shared/image-check.ts`); served from a separate public bucket under a CSP that blocks scripts | Low |
| T | Finishing someone else's upload | `uploader_hash` = salted browser id, constant-time compare, 30-min window, idempotent status transition (`submit-tolet/index.ts:47-104`) | None found |
| I | Faces, plates or numbers in photos | Human review before publication | Depends on reviewer diligence; no written moderation routine (PW-15) |
| I | Photos kept past 60 days | `tolet-maintenance` via pg_cron + Vault `cron_secret` | **Cron never confirmed on Mumbai (PW-03)** |
| D | Upload flood | Turnstile + 5/day (upload URL), 10/day (submit) | Low |
| E | anon writing to buckets | Verified live: anon upload, overwrite and delete refused on both buckets | None found |

## Flow 3: backups and operations

GitHub Actions `backup.yml` → `pg_dump` over the Session pooler → workflow artifact (90 days). `keepalive.yml` reads with the anon key; `nightly-rebuild.yml` posts to the Netlify build hook.

| STRIDE | Threat | Control | Residual |
|---|---|---|---|
| I | **Anyone downloads the database** | **None.** Public repo; artifacts listed publicly (`GET /repos/myogesh97/guwahati-rent/actions/artifacts` without auth returned 5 `db-backup-*`) and downloadable by any signed-in GitHub user. Dumps contain pins incl. private columns, report notes, hashes, admin user id | **Open P0 (PW-25)** |
| I | DB URL leaked in logs | Workflow validates the URL shape without echoing it (`backup.yml:20-40`) | Low |
| T | Compromised third-party action steals secrets | Actions now pinned to commit SHAs; token is `contents: read` (commit `ef57cf7`) | Low |
| T | Malicious merge to `main` deploys to production | CI runs, but `main` has no branch protection (PW-10); Netlify deploys every push | Single maintainer, so low likelihood; enable protection |
| D | Free project pauses | keepalive every 2 days | Low |
| E | Leaked service-role key | Only in Edge runtime env; CI asserts `dist/` holds no secret key; never in git history (regex scan) | Rotate if any doubt |

## Out of scope / not tested

Supabase and Netlify platform security, Cloudflare Turnstile bypass research, the admin's email account, DDoS beyond the platform quotas.
