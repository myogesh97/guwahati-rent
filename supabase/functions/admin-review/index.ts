// NEXT-PHASES §2a.7 admin-review: list / approve / reject pending To-Let boards.
// Caller sends their Supabase Auth access token; only users listed in `admins` get through.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';
import { PRIVATE_BUCKET, PUBLIC_BUCKET, pointFromEwkb, publicPath, removeFiles } from '../_shared/tolet.ts';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('approve'), boardId: z.string().uuid() }),
  z.object({ action: z.literal('reject'), boardId: z.string().uuid() }),
]);

const SIGNED_URL_SECONDS = 600;

async function isAdmin(req: Request): Promise<boolean> {
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const { data, error } = await admin.auth.getUser(m[1]);
  if (error || !data?.user) return false;
  const { data: row, error: aErr } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (aErr) throw aErr;
  return Boolean(row);
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    if (!(await isAdmin(req))) return fail(req, 403, 'Admins only.');

    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'body')))];
      return fail(req, 400, 'Invalid request.', { fields });
    }
    const body = parsed.data;

    if (body.action === 'list') {
      const { data: rows, error } = await admin
        .from('tolet_boards')
        .select('id, photo_path, thumb_path, location, created_at, expires_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      const paths = (rows ?? []).flatMap((r) => [r.thumb_path, r.photo_path]).filter(Boolean) as string[];
      const urls = new Map<string, string>();
      if (paths.length) {
        const { data: signed, error: sErr } = await admin.storage
          .from(PRIVATE_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_SECONDS);
        if (sErr) throw sErr;
        for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
      }
      const boards = (rows ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        expires_at: r.expires_at,
        ...pointFromEwkb(r.location),
        thumbUrl: (r.thumb_path && urls.get(r.thumb_path)) ?? null,
        fullUrl: urls.get(r.photo_path) ?? null,
      }));
      return ok(req, { boards });
    }

    const { data: board, error } = await admin
      .from('tolet_boards')
      .select('id, status, photo_path, thumb_path')
      .eq('id', body.boardId)
      .maybeSingle();
    if (error) throw error;
    if (!board || board.status !== 'pending') {
      return fail(req, 409, 'This board is not waiting for review any more.');
    }
    const originals = [board.photo_path, board.thumb_path].filter(Boolean) as string[];

    if (body.action === 'reject') {
      await removeFiles(PRIVATE_BUCKET, originals);
      const { error: upErr } = await admin
        .from('tolet_boards')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', board.id);
      if (upErr) throw upErr;
      return ok(req, { boardId: board.id, status: 'rejected' });
    }

    // approve: copy both files into the public bucket, publish, then delete the private originals.
    const fullDest = publicPath(board.id, board.photo_path);
    const thumbDest = board.thumb_path ? publicPath(board.id, board.thumb_path) : null;
    const src = admin.storage.from(PRIVATE_BUCKET);
    for (const [from, to] of [
      [board.photo_path, fullDest],
      [board.thumb_path, thumbDest],
    ] as const) {
      if (!from || !to) continue;
      const { error: cErr } = await src.copy(from, to, { destinationBucket: PUBLIC_BUCKET });
      if (cErr) {
        await removeFiles(PUBLIC_BUCKET, [fullDest, thumbDest]).catch(() => {});
        throw cErr;
      }
    }
    const { error: upErr } = await admin
      .from('tolet_boards')
      .update({
        status: 'approved',
        public_photo_path: fullDest,
        public_thumb_path: thumbDest,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', board.id);
    if (upErr) throw upErr;
    // If this fails the board is still correctly public; tolet-maintenance removes leftovers at expiry.
    await removeFiles(PRIVATE_BUCKET, originals).catch((e) =>
      console.warn('admin-review: could not remove private originals:', e instanceof Error ? e.message : e),
    );
    return ok(req, { boardId: board.id, status: 'approved' });
  } catch (e) {
    console.error('admin-review failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
