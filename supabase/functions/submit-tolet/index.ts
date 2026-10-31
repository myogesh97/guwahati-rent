// NEXT-PHASES §2a.7 submit-tolet: after both files are uploaded, check them and queue the board
// for review (status 'uploading' -> 'pending'). Nothing is public until an admin approves it.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, safeEqual, saltedHash } from '../_shared/crypto.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';
import { PRIVATE_BUCKET } from '../_shared/tolet.ts';
import { TOLET_MAX_BYTES, TOLET_MIME } from '../_shared/rules.ts';

const Body = z.object({
  boardId: z.string().uuid(),
  browserId: z.string().min(8).max(100),
});

const MAX_AGE_MS = 30 * 60 * 1000;
const ALLOWED_MIME = Object.values(TOLET_MIME);

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'body')))];
      console.warn('submit-tolet validation failed:', fields.join(', '));
      return fail(req, 400, 'Something about this upload was not right. Please try again.', { fields });
    }
    const { boardId, browserId } = parsed.data;

    const { data: board, error } = await admin
      .from('tolet_boards')
      .select('id, status, created_at, uploader_hash, photo_path, thumb_path')
      .eq('id', boardId)
      .maybeSingle();
    if (error) throw error;

    // Same answer for "no such board", "not yours" and "already submitted", so ids can't be probed.
    const mine =
      board &&
      board.status === 'uploading' &&
      board.uploader_hash &&
      safeEqual(board.uploader_hash, await saltedHash(browserId));
    if (!mine) return fail(req, 403, 'This upload can no longer be finished. Please start again.');
    if (Date.now() - new Date(board.created_at).getTime() > MAX_AGE_MS) {
      return fail(req, 410, 'This upload took too long and expired. Please start again.');
    }

    // Both files must exist, be small enough and be images (the bucket enforces this too).
    const { data: files, error: listErr } = await admin.storage
      .from(PRIVATE_BUCKET)
      .list(`pending/${boardId}`, { limit: 10 });
    if (listErr) throw listErr;
    for (const path of [board.photo_path, board.thumb_path]) {
      const name = String(path).split('/').pop();
      const f = files?.find((x) => x.name === name);
      const size = Number(f?.metadata?.size ?? NaN);
      const mime = String(f?.metadata?.mimetype ?? '');
      if (!f || !(size > 0) || size > TOLET_MAX_BYTES || !ALLOWED_MIME.includes(mime)) {
        return fail(req, 400, 'The photo did not finish uploading. Please try again.', {
          fields: [name === String(board.photo_path).split('/').pop() ? 'full' : 'thumb'],
        });
      }
    }

    if (!(await withinRateLimit('submit-tolet', clientIp(req), browserId, 10))) {
      return fail(req, 429, 'Too many boards today. Try again tomorrow.');
    }

    const { data: updated, error: upErr } = await admin
      .from('tolet_boards')
      .update({ status: 'pending' })
      .eq('id', boardId)
      .eq('status', 'uploading') // a double tap can't submit twice
      .select('id');
    if (upErr) throw upErr;
    if (!updated?.length) return fail(req, 409, 'This board was already submitted.');

    return ok(req, { boardId });
  } catch (e) {
    console.error('submit-tolet failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
