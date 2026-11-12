// Survey import (NEXT-PHASES §3.3). Runs locally only:
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret> \
//     npx tsx scripts/import-survey.ts responses.csv [--dry-run]
//
// Every row comes from a person who ticked the consent box on the Google Form. Rows without
// consent, with an unknown locality, or with an implausible rent are skipped and counted.
// Pins land at the locality centre plus a deterministic jitter (≤150 m), rounded to 3 dp, with
// source='survey' and location_approx=true. Re-running the same CSV imports nothing new
// (unique import_ref; on_conflict ignore). The key is read from the environment and never written
// anywhere. Nobody can delete these pins from the UI (random edit token); the owner deletes via SQL.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { looksLikePublicKey, mapHeaders, mapRow, parseCsv, sha256, type SurveyPin } from './survey';

const [, , file, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');
if (!file) {
  console.error('usage: npx tsx scripts/import-survey.ts responses.csv [--dry-run]');
  process.exit(2);
}

const rows = parseCsv(readFileSync(file, 'utf8'));
if (rows.length < 2) {
  console.error('CSV has no data rows');
  process.exit(2);
}
const headers = mapHeaders(rows[0]);
if ('missing' in headers) {
  console.error(
    `CSV is missing columns: ${headers.missing.join(', ')}\nFound: ${rows[0].join(' | ')}`,
  );
  process.exit(2);
}

const pins: SurveyPin[] = [];
const skipped = new Map<string, number>();
for (const cells of rows.slice(1)) {
  const r = mapRow(cells, headers);
  if (r.ok) pins.push(r.pin);
  else {
    const key = r.reason.replace(/".*"/, '"…"'); // group by reason, not by value
    skipped.set(key, (skipped.get(key) ?? 0) + 1);
  }
}
// The same answers twice in one file are one pin.
const unique = [...new Map(pins.map((p) => [p.import_ref, p])).values()];

console.log(
  `rows: ${rows.length - 1} · importable: ${unique.length} (${pins.length - unique.length} duplicates in file)`,
);
for (const [reason, n] of [...skipped].sort((a, b) => b[1] - a[1]))
  console.log(`  skipped ${n}: ${reason}`);
const byLocality = new Map<string, number>();
for (const p of unique) byLocality.set(p.locality_slug, (byLocality.get(p.locality_slug) ?? 0) + 1);
console.log(`localities: ${[...byLocality].map(([k, v]) => `${k} ${v}`).join(', ')}`);

if (dryRun) {
  console.log('dry run: nothing written');
  process.exit(0);
}

const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url || !key) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never in a file in this repo).',
  );
  process.exit(2);
}
if (looksLikePublicKey(key)) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY looks like a publishable/anon key. The import needs the secret service-role key.',
  );
  process.exit(2);
}

async function main() {
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200).map(({ lat, lng, ...p }) => ({
      ...p,
      location: `SRID=4326;POINT(${lng} ${lat})`,
      // Random hash: nobody holds the plain token, so the UI can't delete these (owner uses SQL).
      edit_token_hash: sha256(randomBytes(32).toString('hex')),
    }));
    const res = await fetch(`${url}/rest/v1/pins?on_conflict=import_ref`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`insert failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
      process.exit(1);
    }
    const data = (await res.json()) as unknown[];
    inserted += data.length;
  }
  console.log(
    `imported ${inserted} new pins (${unique.length - inserted} were already in the database)`,
  );
}
void main();
