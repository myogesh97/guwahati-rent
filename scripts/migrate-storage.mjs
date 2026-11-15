// One-off: copy every file in the To-Let buckets from the OLD Supabase project to the NEW one.
// Database rows are copied separately with pg_dump (see MIGRATE-REGION.md); storage files are not in that dump.
//
// Usage (keys are read from the environment, never written anywhere):
//   OLD_URL=https://<old-ref>.supabase.co OLD_SECRET=<old sb_secret_ key> \
//   NEW_URL=https://<new-ref>.supabase.co NEW_SECRET=<new sb_secret_ key> \
//   node scripts/migrate-storage.mjs [--dry-run]
//
// Safe to re-run: existing files in the new project are overwritten with the same bytes.
import { createClient } from '@supabase/supabase-js';

const BUCKETS = ['tolet', 'tolet-public'];
const dryRun = process.argv.includes('--dry-run');

const { OLD_URL, OLD_SECRET, NEW_URL, NEW_SECRET } = process.env;
for (const [k, v] of Object.entries({ OLD_URL, OLD_SECRET, NEW_URL, NEW_SECRET })) {
  if (!v) {
    console.error(`Missing ${k}. See usage at the top of this file.`);
    process.exit(2);
  }
}
for (const [k, v] of Object.entries({ OLD_SECRET, NEW_SECRET })) {
  if (v.startsWith('sb_publishable_')) {
    console.error(`${k} is a publishable key. Use the secret (service role) key; it is needed to read private buckets.`);
    process.exit(2);
  }
}
if (OLD_URL === NEW_URL) {
  console.error('OLD_URL and NEW_URL are the same project. Aborting.');
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const oldDb = createClient(OLD_URL, OLD_SECRET, opts);
const newDb = createClient(NEW_URL, NEW_SECRET, opts);

/** Recursively list every file path in a bucket. Folders come back with id === null. */
async function listAll(client, bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(client, bucket, path)));
      else out.push({ path, type: item.metadata?.mimetype ?? 'application/octet-stream' });
    }
    if (data.length < 1000) break;
  }
  return out;
}

let copied = 0;
let failed = 0;
for (const bucket of BUCKETS) {
  const files = await listAll(oldDb, bucket);
  console.log(`${bucket}: ${files.length} file(s)`);
  for (const f of files) {
    if (dryRun) {
      console.log(`  would copy ${bucket}/${f.path}`);
      continue;
    }
    const { data: blob, error: dErr } = await oldDb.storage.from(bucket).download(f.path);
    if (dErr || !blob) {
      console.error(`  FAIL download ${bucket}/${f.path}: ${dErr?.message}`);
      failed++;
      continue;
    }
    const { error: uErr } = await newDb.storage
      .from(bucket)
      .upload(f.path, blob, { contentType: f.type, upsert: true });
    if (uErr) {
      console.error(`  FAIL upload ${bucket}/${f.path}: ${uErr.message}`);
      failed++;
      continue;
    }
    copied++;
    console.log(`  ok ${bucket}/${f.path}`);
  }
}

// Verify counts match
if (!dryRun) {
  for (const bucket of BUCKETS) {
    const [a, b] = await Promise.all([listAll(oldDb, bucket), listAll(newDb, bucket)]);
    console.log(`verify ${bucket}: old ${a.length}, new ${b.length} ${a.length === b.length ? 'OK' : 'MISMATCH'}`);
    if (a.length !== b.length) failed++;
  }
}
console.log(dryRun ? 'Dry run: nothing copied.' : `Done: ${copied} copied, ${failed} problem(s).`);
process.exit(failed ? 1 : 0);
