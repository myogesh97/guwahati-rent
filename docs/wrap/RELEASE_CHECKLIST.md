# Release checklist

✅ verified (command or evidence given) · ❌ failing or not done · 🔍 manual check needed. State on 26 Nov 2026, branch `wrap/release-audit`.

## Gates

| # | Gate | State | Evidence / how to check |
|---|---|---|---|
| 1 | Typecheck | ✅ | `npm run typecheck`: 0 errors |
| 2 | Lint | ✅ | `npm run lint`: 0 problems |
| 3 | Unit tests | ✅ | `npm test`: 58/58 |
| 4 | Edge Function tests | ✅ | `npm run test:deno`: 23/23 |
| 5 | Database security + stats suite | ✅ | `npm run test:db`: 94/94 |
| 6 | Build + bundle assertions (no demo code, no secret key) | ✅ | `npm run build`; CI step "Production bundle must not contain…" |
| 7 | Runtime dependency audit | ✅ | `npm audit --omit=dev`: 0 (now a CI gate) |
| 8 | Browser journeys | ❌ | 211/229. 18 fail only because production has 0 pins (PW-28). Re-run after data exists |
| 9 | Automated accessibility, all routes | ✅ | Lighthouse a11y 100 on 8 routes (initial state) |
| 10 | Manual accessibility (AT, zoom, reflow) | 🔍 | [HUMAN_REQUIRED.md](HUMAN_REQUIRED.md) step 9 |
| 11 | Production access-control gate | ✅ | `scripts/security-check.sh`: 65/66; the 1 needs a seed row |
| 12 | Secrets not in repo or history | ✅ | regex scan of `git log --all -p`; `.env` never tracked. 🔍 enable GitHub secret scanning |
| 13 | **Backups not publicly downloadable** | ❌ | P0 PW-25 |
| 14 | **Privacy contact present** | ❌ | P0 PW-01 |
| 15 | **Real data on the map** | ❌ | P0 PW-02: 0 rows in `public_pins` |
| 16 | Deletion erases personal data | ❌ | P1 PW-26 |
| 17 | Cron / Vault on production | 🔍 | HUMAN_REQUIRED step 4 |
| 18 | Performance: mobile LCP ≤ 2.5 s | ❌ | 2.7 s (Lighthouse mobile, live `/`); CLS 0.025 ✅ |
| 19 | Branch protection: CI blocks merge | ❌ | PW-10 |
| 20 | Uptime / error alerting | ❌ | PW-13 |
| 21 | Security headers live | ✅ | `curl -sI https://guwahati-rent.netlify.app/`: CSP, HSTS preload, nosniff, XFO, Referrer-Policy, Permissions-Policy |
| 22 | CI pinned + least privilege | ✅ | commit `ef57cf7` |

## Releasing this branch

1. Owner reviews the PR for `wrap/release-audit` (docs, CI hardening, one CSS change; no database or function changes).
2. Merge → Netlify deploys automatically. Nothing else needs a deploy.
3. Check: `curl -s https://guwahati-rent.netlify.app/about.html | grep -c 0f7a41` is ≥ 1 (CSS is hashed, so check the WhatsApp button colour in DevTools instead if that is 0).
4. Tag: `git tag v0.5.1 && git push origin v0.5.1`.

## Rollback

| Part | How | Time |
|---|---|---|
| Frontend | Netlify → Deploys → previous successful deploy → **Publish deploy**. Or `git revert <merge>` and push | 1 min |
| CI workflows | `git revert ef57cf7` | 2 min |
| Edge Functions (not changed here) | Redeploy from the previous tag: `git checkout v0.5.0 -- supabase/functions && npx supabase functions deploy --no-verify-jwt` | 5 min |
| Database (not changed here) | Forward migration only; last resort `pg_restore --clean --if-exists --schema=public <dump>` (loses newer rows) | 15+ min |
