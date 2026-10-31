// NEXT-PHASES §2a.7 report-tolet: "Board is gone". One report per browser per board; the
// public_tolet view hides a board at 3 reports and tolet-maintenance deletes it overnight.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, saltedHash } from '../_shared/crypto.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';

const Body = z.object({
  boardId: z.string().uuid(),
  browserId: z.string().min(8).max(100),
  turnstileToken: z.string().min(1).max(4096),
});

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'body')))];
      console.warn('report-tolet validation failed:', fields.join(', '));
      return fail(req, 400, 'Could not send this report. Please try again.', { fields });
    }
    const { boardId, browserId, turnstileToken } = parsed.data;
    const ip = clientIp(req);

    if (!(await verifyTurnstile(turnstileToken, ip))) {
      return fail(req, 403, 'Spam check failed. Please refresh the check and try again.');
    }

    const { data: board, error } = await admin
      .from('tolet_boards')
      .select('id, status, expires_at')
      .eq('id', boardId)
      .maybeSingle();
    if (error) throw error;
    if (!board || board.status !== 'approved' || new Date(board.expires_at).getTime() <= Date.now()) {
      return fail(req, 404, 'This board is no longer on the map.');
    }

    if (!(await withinRateLimit('report-tolet', ip, browserId, 10))) {
      return fail(req, 429, 'Too many reports today. Try again tomorrow.');
    }

    const { error: insErr } = await admin
      .from('tolet_reports')
      .insert({ board_id: boardId, reporter_hash: await saltedHash(browserId) });
    // 23505 = this browser already reported this board. Counted once; answer ok anyway.
    if (insErr && insErr.code !== '23505') throw insErr;

    return ok(req);
  } catch (e) {
    console.error('report-tolet failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
