// admin-review: To-Let boards (NEXT-PHASES §2a.7: list / approve / reject) and reported pins
// (§4.1: list_reports / keep_pin / remove_pin). Caller sends their Supabase Auth access token;
// only users listed in `admins` get through. Every decision is written to moderation_log.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';
import { PRIVATE_BUCKET, PUBLIC_BUCKET, pointFromEwkb, publicPath, removeFiles } from '../_shared/tolet.ts';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('approve'), boardId: z.string().uuid() }),
  z.object({ action: z.literal('reject'), boardId: z.string().uuid() }),
  z.object({ action: z.literal('list_reports') }),
  z.object({ action: z.literal('keep_pin'), pinId: z.string().uuid() }),
  z.object({ action: z.literal('remove_pin'), pinId: z.string().uuid() }),
]);

/** Public-safe pin columns for the review card (never edit_token_hash or contacts). */
const PIN_REVIEW_COLUMNS =
  'id, kind, property_type, bhk, rent, furnishing, gated, locality_slug, society_name, one_liner, waterlogging, status, report_count, created_at, reviewed_at, location';

async function log(adminId: string, action: string, ids: { pin_id?: string; board_id?: string }) {
  const { error } = await admin.from('moderation_log').insert({ admin_id: adminId, action, ...ids });
  if (error) throw error;
}

const SIGNED_URL_SECONDS = 600;

/** The admin's user id, or null if the caller is not a signed-in admin. */
async function adminId(req: Request): Promise<string | null> {
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data, error } = await admin.auth.getUser(m[1]);
  if (error || !data?.user) return null;
  const { data: row, error: aErr } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (aErr) throw aErr;
  return row ? data.user.id : null;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const me = await adminId(req);
    if (!me) return fail(req, 403, 'Admins only.');

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

    if (body.action === 'list_reports') {
      // Newest open reports first; their pins (plus anything auto-hidden), max 50 pins.
      const { data: reports, error } = await admin
        .from('reports')
        .select('pin_id, reason, message, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const { data: hidden, error: hErr } = await admin.from('pins').select('id').eq('status', 'hidden').limit(50);
      if (hErr) throw hErr;
      const ids = [...new Set([...(reports ?? []).map((r) => r.pin_id), ...(hidden ?? []).map((h) => h.id)])].slice(0, 50);
      if (!ids.length) return ok(req, { pins: [] });
      const { data: pins, error: pErr } = await admin.from('pins').select(PIN_REVIEW_COLUMNS).in('id', ids);
      if (pErr) throw pErr;
      const byId = new Map((pins ?? []).map((p) => [p.id, p]));
      const out = ids
        .map((id) => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map(({ location, ...p }) => {
          const rs = (reports ?? []).filter((r) => r.pin_id === p.id);
          return {
            ...p,
            ...pointFromEwkb(location),
            hidden: p.status === 'hidden',
            reports: rs.map(({ reason, message, created_at }) => ({ reason, message, created_at })),
            firstReport: rs.at(-1)?.created_at ?? null,
            lastReport: rs[0]?.created_at ?? null,
          };
        });
      return ok(req, { pins: out });
    }

    if (body.action === 'keep_pin' || body.action === 'remove_pin') {
      const { data: pin, error } = await admin.from('pins').select('id, status').eq('id', body.pinId).maybeSingle();
      if (error) throw error;
      if (!pin || pin.status === 'archived') return fail(req, 409, 'This pin was already removed.');
      const now = new Date().toISOString();
      const keep = body.action === 'keep_pin';
      const { error: rErr } = await admin
        .from('reports')
        .update({ status: keep ? 'dismissed' : 'actioned', resolved_at: now })
        .eq('pin_id', pin.id)
        .eq('status', 'open');
      if (rErr) throw rErr;
      const { error: uErr } = await admin
        .from('pins')
        .update(keep ? { status: 'active', report_count: 0, reviewed_at: now } : { status: 'archived', reviewed_at: now })
        .eq('id', pin.id);
      if (uErr) throw uErr;
      if (!keep) {
        const { error: cErr } = await admin.from('pin_contacts').delete().eq('pin_id', pin.id);
        if (cErr) throw cErr;
      }
      await log(me, keep ? 'keep' : 'remove', { pin_id: pin.id });
      return ok(req, { pinId: pin.id, status: keep ? 'active' : 'archived' });
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
      await log(me, 'reject', { board_id: board.id });
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
    await log(me, 'approve', { board_id: board.id });
    return ok(req, { boardId: board.id, status: 'approved' });
  } catch (e) {
    console.error('admin-review failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
