// NEXT-PHASES §2a.7 tolet-maintenance: nightly (pg_cron, migration 0005). Deletes boards that are
// expired, rejected, gone, reported gone 3+ times, or stuck uploading for over 2 hours, together
// with their files in BOTH buckets. Files can't be deleted from SQL, hence this function.
import { admin } from '../_shared/supabase.ts';
import { safeEqual } from '../_shared/crypto.ts';
import { fail, ok, preflight } from '../_shared/http.ts';
import { PRIVATE_BUCKET, PUBLIC_BUCKET, removeFiles } from '../_shared/tolet.ts';

const BATCH = 200;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!secret || !safeEqual(given, secret)) return fail(req, 401, 'Unauthorized.');

  try {
    const now = new Date();
    const stuck = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    let deleted = 0;
    let files = 0;
    let failed = 0;
    for (let round = 0; round < 20; round++) {
      const { data: rows, error } = await admin
        .from('tolet_boards')
        .select('id, photo_path, thumb_path, public_photo_path, public_thumb_path')
        .or(
          [
            `expires_at.lt.${now.toISOString()}`,
            'status.in.(rejected,gone)',
            'gone_reports.gte.3',
            `and(status.eq.uploading,created_at.lt.${stuck})`,
          ].join(','),
        )
        .limit(BATCH);
      if (error) throw error;
      if (!rows?.length) break;

      const done: string[] = [];
      for (const r of rows) {
        try {
          // Files first: if storage fails, the row stays and the next run retries.
          await removeFiles(PRIVATE_BUCKET, [r.photo_path, r.thumb_path]);
          await removeFiles(PUBLIC_BUCKET, [r.public_photo_path, r.public_thumb_path]);
          files += [r.photo_path, r.thumb_path, r.public_photo_path, r.public_thumb_path].filter(Boolean).length;
          done.push(r.id);
        } catch {
          failed++;
        }
      }
      if (done.length) {
        const { error: dErr } = await admin.from('tolet_boards').delete().in('id', done);
        if (dErr) throw dErr;
        deleted += done.length;
      }
      if (rows.length < BATCH || !done.length) break;
    }
    console.log(`tolet-maintenance: deleted ${deleted} boards, ${files} file paths, ${failed} failed`);
    return ok(req, { deleted, files, failed });
  } catch (e) {
    console.error('tolet-maintenance failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Maintenance failed.');
  }
});
