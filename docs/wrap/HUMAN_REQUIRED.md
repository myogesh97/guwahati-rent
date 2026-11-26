# Owner actions (human required)

Ordered by severity, then by what unblocks what. Times are estimates for one person. Each item gives the ledger ID from [PENDING.md](PENDING.md).

## Today (P0)

### 1. Turn on encrypted backups and delete the old ones: PW-25 · 15 min
`backup.yml` now encrypts every dump with [age](https://age-encryption.org) and refuses to run without a key. Until step 2 is done, the weekly backup **fails on purpose**.
1. On your own computer: `brew install age`, then `age-keygen -o ~/guwahati-rent-backup-key.txt`. It prints `Public key: age1…`.
2. GitHub → Settings → Secrets and variables → Actions → New repository secret: name `BACKUP_AGE_RECIPIENT`, value = that `age1…` public key.
3. Keep `~/guwahati-rent-backup-key.txt` **offline and backed up** (password manager or USB). Without it no backup can be restored. Never put it in GitHub.
4. Actions → weekly-backup → Run workflow. It must be green and upload a `.dump.age` file.
5. Then delete the 5 old **unencrypted** artifacts (irreversible):
   ```bash
   gh api repos/myogesh97/guwahati-rent/actions/artifacts --jq '.artifacts[] | select(.created_at < "2026-11-27") | .id' \
     | xargs -I{} gh api -X DELETE repos/myogesh97/guwahati-rent/actions/artifacts/{}
   ```
6. If any real person's data was in those dumps, record the exposure (DPDP Act 2023 s.8(6): a personal data breach must be reported to the Data Protection Board and to each affected person). On 26 Nov they contained test-looking data: 1 admin id, 2 report notes, 1 pin with a society name. Your call whether those were real people.

### 2. Privacy contact: PW-01 · done in code
`m.yogesh0197@gmail.com` is on the privacy page, in every page footer, in the About FAQ and in SECURITY.md. It goes live when the PR is merged. Check that inbox weekly.

### 3. Decide what the empty map means: PW-02 · 5 min decision
Live data on 26 Nov: 0 rents, 0 boards. The "150+ pins" were not imported into `ngssgjuagrlyhsvtiwhk`. Either:
- run the import: `npm run import-survey -- responses.csv --dry-run`, check the counts, then run it for real with `SUPABASE_SERVICE_ROLE_KEY` set in your shell only; or
- accept that the site stays empty and say so on the home page, or turn the showcase on deliberately (`VITE_DEMO_SHOWCASE=true`; everything is labelled DEMO).

## This week (P1)

### 4. Confirm cron is running on Mumbai: PW-03 · 10 min
SQL editor:
```sql
select name from vault.decrypted_secrets;          -- expect project_url, cron_secret
select decrypted_secret like '%ngssgjuagrlyhsvtiwhk%' from vault.decrypted_secrets where name = 'project_url';  -- expect true
select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j using (jobid) order by d.start_time desc limit 10;
select status_code, created from net._http_response order by created desc limit 5;   -- expect 200
```
A 401 means `CRON_SECRET` differs between Vault and the function secrets. If a `service_role_key` Vault secret exists, delete it (nothing uses it since Phase 3 was cancelled).

### 5. Delete the old Frankfurt project: PW-05 · 5 min
Supabase dashboard → project `apgdczuofczobxaggsfy` → Settings → General → Delete project. A paused project still holds data.

### 6. Deploy the real-delete fix: PW-26 · 5 min, after the PR is merged
Order matters: database first, then the function, or a delete fails.
```bash
npx supabase db push --linked                              # applies 0011_pin_erasure.sql
npx supabase functions deploy edit-pin --no-verify-jwt
```
Check in the SQL editor: `select column_name from information_schema.columns where table_name = 'pins' and column_name = 'archived_at';` returns one row.

### 7. Privacy policy facts: PW-27 · done in code
The policy now states: data in India (Mumbai), encrypted backups with GitHub kept 90 days, deleted pins erased at once, moderator-removed pins erased after 30 days. If any of that is wrong, tell me.

### 8. Legal review or written risk acceptance: PW-08 · 1–2 h with a lawyer, or 5 min to accept
If you accept the risk, add a dated line to [STATUS.md](../../STATUS.md): "PW-08 risk accepted by <name>, <date>". Rule: any P1 left open needs that written acceptance.

### 9. Screen-reader and manual accessibility pass: PW-06 · about 3 h
Devices: an iPhone (VoiceOver + Safari) and an Android phone (TalkBack + Chrome). Desktop optional (NVDA + Firefox).
1. **Keyboard only (desktop):** Tab from the top of `/`. Skip link works; open filters, change one, and hear the result count; switch to the List view; open a pin with Enter; Esc returns focus to the row. Add a rent: arrow keys move the map, Enter on "Use this spot", fill every chip group, the date picker, tick consent, submit. Nothing traps focus (check the calendar and the Turnstile box).
2. **VoiceOver / TalkBack:** repeat step 1 by swiping. Every chip announces its name **and** selected state; errors are read out when you submit with a missing field; "Link copied." and the submit result are announced.
3. **Zoom 200% and 400%** (desktop, 1280 px window): no text cut off; at 400% no sideways scrolling except inside the stats table.
4. **320 px** (DevTools device toolbar): every dialog usable.
5. **Text spacing:** run the "text spacing" bookmarklet (W3C test) on `/`, a pin card and `/about`.
6. **Focus not obscured:** at 375×812, tab through `/`; a focused control must never be fully hidden by the header, the bottom bar or a toast.
7. **Target size:** dialog close buttons, filter chips and the map +/− buttons are at least 24×24 px.

Record PASS/FAIL against each NEEDS-MANUAL row in [ACR_WCAG22_AA.md](ACR_WCAG22_AA.md).

### 10. Check the 30 locality centres: PW-07 · 1 h
Open `public/localities.json` next to a map and fix any centre that is off. Edit both `public/localities.json` and `supabase/functions/_shared/localities.ts` (a test enforces they match), then redeploy `submit-pin`.

## Soon (P2)

| # | Item | ID | Time |
|---|---|---|---|
| 11 | Branch protection on `main`: Settings → Branches → require the `checks` and `database` jobs to pass | PW-10 | 5 min |
| 12 | Turn on GitHub **secret scanning** and **private vulnerability reporting** (Settings → Code security). SECURITY.md points to the latter | PW-11 | 5 min |
| 13 | Uptime alert: a free monitor (e.g. UptimeRobot) on `/` and on `…/rest/v1/public_stats_city?select=n&limit=1` with the `apikey` header | PW-13 | 15 min |
| 14 | Rollback drill once: Netlify → Deploys → pick the previous deploy → Publish; then publish the latest again | PW-14 | 10 min |
| 15 | Confirm your user is in `admins` and the Auth redirect URLs include `https://guwahati-rent.netlify.app/admin.html` | PW-16 | 5 min |
| 16 | Write down who moderates and how often (I can draft it) | PW-15 | 10 min |
| 17 | Lighthouse on a real budget Android over 4G (lab LCP is 2.7 s, target 2.5 s) | PW-09 | 20 min |
| 18 | Choose a licence (e.g. MIT for code), or leave "all rights reserved" on purpose | PW-20 | 5 min |
| 19 | Delete the 3 merged branches: `git push origin --delete demo-showcase phase-2c seo-a11y-audit` | PW-24 | 1 min |

## Incident runbook

| Event | Do this, in order |
|---|---|
| Service-role key leaked | Supabase → Settings → API → roll the secret key. Edge Functions get the new one automatically. Update `SUPABASE_DB_URL` only if the DB password also leaked |
| DB password leaked | Settings → Database → reset password; update the `SUPABASE_DB_URL` Actions secret |
| `CRON_SECRET` leaked | `openssl rand -hex 32` → `npx supabase secrets set CRON_SECRET=…` and update the Vault secret `cron_secret` to the same value |
| `HASH_SALT` leaked | Rotate the same way. Rate-limit and duplicate-report counters reset (harmless) |
| Turnstile secret leaked | Cloudflare → Turnstile → rotate → `npx supabase secrets set TURNSTILE_SECRET_KEY=…` |
| Spam wave | Lower limits in the function (`withinRateLimit(..., N)`) and redeploy. For a read-only site, unset `VITE_SUPABASE_ANON_KEY` in Netlify and redeploy (forms disable themselves) |
| Bad deploy | Netlify → Deploys → previous → Publish. Database: forward migration, or `pg_restore --clean --if-exists --schema=public` from the latest dump ([DEPLOY.md](../../DEPLOY.md) §5) |
