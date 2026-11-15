# Move Supabase from Frankfurt to Mumbai

**Why:** the project `apgdczuofczobxaggsfy` was created in **eu-central-1 (Frankfurt)**. Every request from India travels to Europe and back. The new project goes in **ap-south-1 (Mumbai)**.

**Downtime:** none for readers. Writes are lost only if someone submits between step 9 (data copy) and step 12 (switch), about 15 minutes, so don't submit pins or boards during that window.

**Rule:** don't delete or pause the old project until step 16. It's your rollback.

Placeholders used below. Write yours down as you get them:

| Placeholder | Where it comes from |
|---|---|
| `NEW_REF` | New project's dashboard URL: `supabase.com/dashboard/project/<NEW_REF>` |
| `NEW_PUBLISHABLE` | New project → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |
| `NEW_SECRET` | Same page → Secret key (`sb_secret_…`). **Never** in `.env`, Netlify or git. |
| `OLD_SECRET` | Old project → same page → Secret key |
| `OLD_DB` / `NEW_DB` | Each project → **Connect** button → **Session pooler** connection string (port 5432), with the database password filled in. If the password has special characters, percent-encode them. |
| `TURNSTILE_SECRET` | Cloudflare → Turnstile → your widget → Secret key. If you don't have it, rotate it there and use the new one. |

---

## A. Build the new project (the live site keeps running on the old one)

**1. Create the project** at supabase.com → New project
- Name: `guwahati-rent-mumbai` · Region: **South Asia (Mumbai)** · Plan: Free
- Generate a database password and **save it** in a password manager
- Security: Enable Data API ✅ · Automatically expose new tables ☐ (off) · Enable automatic RLS ✅

**2. Extensions** → Database → Extensions: enable `postgis`, `pg_cron`, `pg_net`.

**3. Schema** (Terminal, in `~/Desktop/guwahati-rent`):
```bash
npx supabase link --project-ref NEW_REF
npx supabase db push --linked
```
All 9 migrations (0001–0009) must apply. Check: `npx supabase migration list --linked` shows 0001–0009 both Local and Remote.

**4. Function secrets** (Terminal):
```bash
openssl rand -hex 32        # copy the output: this is the new CRON_SECRET
npx supabase secrets set \
  TURNSTILE_SECRET_KEY=TURNSTILE_SECRET \
  HASH_SALT="$(openssl rand -hex 32)" \
  CRON_SECRET=<the value you just copied> \
  ALLOWED_ORIGINS=http://localhost:5173,https://guwahati-rent.netlify.app
```
(A new `HASH_SALT` only resets daily rate-limit counters and lets a browser re-report a pin it reported before the move. That's acceptable.)

**5. Vault** (new project → SQL Editor, run each line separately):
```sql
select vault.create_secret('https://NEW_REF.supabase.co', 'project_url');
```
```sql
select vault.create_secret('<same CRON_SECRET as step 4>', 'cron_secret');
```

**6. Deploy all 8 functions** (Terminal):
```bash
for f in submit-pin edit-pin report-pin tolet-upload-url submit-tolet report-tolet admin-review tolet-maintenance; do
  npx supabase functions deploy $f --no-verify-jwt || break
done
```

**7. Auth URLs** (new project → Authentication → URL Configuration):
- Site URL: `https://guwahati-rent.netlify.app`
- Redirect URLs: `https://guwahati-rent.netlify.app/admin.html` and `http://localhost:5173/admin.html`

---

## B. Copy the data

**8. Install the Postgres tools** (once):
```bash
brew install libpq
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
pg_dump --version
```

**9. Dump from old, load into new.** The file goes in your home folder, **not** the project folder: it can contain private data.
```bash
OLD_DB='<old Session pooler string>'
NEW_DB='<new Session pooler string>'

pg_dump "$OLD_DB" --data-only --schema=public --no-owner --no-privileges \
  --exclude-table=public.rate_limits \
  --exclude-table=public.admins \
  --exclude-table=public.moderation_log \
  -f ~/guwahati-data.sql

psql "$NEW_DB" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'SET session_replication_role = replica' \
  -f ~/guwahati-data.sql
```
`session_replication_role = replica` stops triggers firing during the load, so report counts and hidden/visible states are copied exactly instead of being recalculated.

**Check the counts match.** Run on **both** projects (SQL Editor, one query):
```sql
select
  (select count(*) from pins)          as pins,
  (select count(*) from public_pins)   as public_pins,
  (select count(*) from reports)       as reports,
  (select count(*) from tolet_boards)  as boards,
  (select count(*) from public_tolet)  as public_boards;
```
All five numbers must be identical. If not, stop and don't switch.

**10. Copy To-Let photos** (Terminal; keys only live in this one command):
```bash
OLD_URL=https://apgdczuofczobxaggsfy.supabase.co OLD_SECRET=OLD_SECRET \
NEW_URL=https://NEW_REF.supabase.co NEW_SECRET=NEW_SECRET \
node scripts/migrate-storage.mjs --dry-run
```
If the list looks right, run it again without `--dry-run`. It must end with `verify … OK` for both buckets and `0 problem(s)`.

**11. Security gate on the new project:**
```bash
SUPABASE_URL=https://NEW_REF.supabase.co SUPABASE_ANON_KEY=NEW_PUBLISHABLE npm run security-check
```
Every line PASS. (Check 3 will say "readable, no private columns (N rows)" because real pins are there. That's a pass.)

---

## C. Switch the site

**12. Point the site at the new project.** All of these go in **one** deploy, because the CSP in `netlify.toml` blocks any database address it doesn't list:
```bash
cd ~/Desktop/guwahati-rent
sed -i '' 's/apgdczuofczobxaggsfy/NEW_REF/g' netlify.toml .env
sed -i '' 's|^VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=NEW_PUBLISHABLE|' .env
grep -n "NEW_REF" netlify.toml .env        # both files must show the new ref
grep -rn "apgdczuofczobxaggsfy" netlify.toml .env || echo "old ref gone"
```
Then in **Netlify → Project configuration → Environment variables**, edit:
- `VITE_SUPABASE_URL` = `https://NEW_REF.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `NEW_PUBLISHABLE`

Then publish:
```bash
git add netlify.toml && git commit -m "Move Supabase to Mumbai (ap-south-1)" && git push
```
(`.env` is gitignored; that's correct.) Wait for Netlify to show **Published**.

**13. Admin account** (accounts don't move between projects):
1. Open `https://guwahati-rent.netlify.app/admin.html` → your email → click the link in your inbox.
2. New project → SQL Editor:
```sql
insert into admins (user_id) select id from auth.users where email = '<your email>';
```

**14. Smoke test on your phone** (live site):
- [ ] Map loads with the same pins as before
- [ ] Pin a rent → refresh → still there → Delete it
- [ ] An **old** pin you created before the move still shows Delete (the edit secret was copied)
- [ ] Spot a To-Let → approve in admin → appears on map with photo
- [ ] Flag a pin → it appears in admin "Reported pins"
- [ ] DevTools console: no CSP errors mentioning `supabase.co`

**If anything is broken:** revert the two Netlify variables and `git revert HEAD && git push`. The old project is untouched.

---

## D. Clean up

**15. GitHub** → repo → Settings → Secrets and variables → Actions, update:
- `SUPABASE_URL` = `https://NEW_REF.supabase.co`
- `SUPABASE_ANON_KEY` = `NEW_PUBLISHABLE`
- `SUPABASE_DB_URL` = new **Session pooler** string

Then Actions → **weekly-backup** → Run workflow. It must go green.

**16. Old project.** After 7 days with no problems: old project → Project Settings → General → **Pause project**. Delete it a week after that.

**17. Delete the dump file**, which may contain private data:
```bash
rm ~/guwahati-data.sql
```

**18. Docs.** Ask your coding agent to replace the old ref and region (`eu-central-1` / pooler host) in the docs (PRODUCTION_READINESS_REPORT.md, DEPLOY.md, NEXT-PHASES.md, CLAUDE.md) with the new ones.

**19. Check the nightly jobs on the new project** the next morning (SQL Editor):
```sql
select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;
```
