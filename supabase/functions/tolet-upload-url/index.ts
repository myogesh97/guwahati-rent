// NEXT-PHASES §2a.7 tolet-upload-url: reserve a board row and hand out two signed upload URLs
// (full + thumb) for the private `tolet` bucket. The browser uploads, then calls submit-tolet.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, saltedHash } from '../_shared/crypto.ts';
import { inGuwahati, round4, toWkt4 } from '../_shared/geo.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';
import { PRIVATE_BUCKET, pendingPaths } from '../_shared/tolet.ts';
import { TOLET_EXTS } from '../_shared/rules.ts';

const Body = z.object({
  turnstileToken: z.string().min(1).max(4096),
  browserId: z.string().min(8).max(100),
  lat: z.number().finite(),
  lng: z.number().finite(),
  ext: z.enum(TOLET_EXTS),
});

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'body')))];
      console.warn('tolet-upload-url validation failed:', fields.join(', '));
      return fail(req, 400, 'Something about this photo upload was not right. Please try again.', { fields });
    }
    const b = parsed.data;
    const ip = clientIp(req);

    if (!(await verifyTurnstile(b.turnstileToken, ip))) {
      return fail(req, 403, 'Spam check failed. Please refresh the check and try again.');
    }
    if (!inGuwahati(b.lat, b.lng)) {
      return fail(req, 400, 'That spot is outside Guwahati. Only Guwahati boards are accepted for now.', {
        fields: ['lat', 'lng'],
      });
    }
    // Rate limit after the cheap checks, so a wrong spot doesn't use up the daily quota.
    if (!(await withinRateLimit('tolet-upload', ip, b.browserId, 5))) {
      return fail(req, 429, 'You have added the maximum number of boards for today. Try again tomorrow.');
    }

    const id = crypto.randomUUID();
    const paths = pendingPaths(id, b.ext);
    const { error: insErr } = await admin.from('tolet_boards').insert({
      id,
      status: 'uploading',
      photo_path: paths.full,
      thumb_path: paths.thumb,
      uploader_hash: await saltedHash(b.browserId),
      location: toWkt4(b.lat, b.lng),
    });
    if (insErr) throw insErr;

    const bucket = admin.storage.from(PRIVATE_BUCKET);
    const [full, thumb] = await Promise.all([
      bucket.createSignedUploadUrl(paths.full),
      bucket.createSignedUploadUrl(paths.thumb),
    ]);
    if (full.error || thumb.error || !full.data || !thumb.data) {
      // No URLs, no upload: drop the reservation instead of leaving it for the nightly cleanup.
      await admin.from('tolet_boards').delete().eq('id', id);
      throw full.error ?? thumb.error ?? new Error('no signed upload url');
    }

    return ok(req, {
      boardId: id,
      lat: round4(b.lat),
      lng: round4(b.lng),
      uploads: { full: full.data.signedUrl, thumb: thumb.data.signedUrl },
    });
  } catch (e) {
    console.error('tolet-upload-url failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
