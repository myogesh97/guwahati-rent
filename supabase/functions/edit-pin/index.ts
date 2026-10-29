// SPEC §7.3 edit-pin. Phase 1: delete only. update / mark_rented / renew arrive in Phases 2–3.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, sha256 } from '../_shared/crypto.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';

const Body = z.object({
  id: z.string().uuid(),
  editToken: z.string().min(20).max(200),
  action: z.literal('delete'),
  browserId: z.string().min(8).max(100),
});

/** Constant-time string comparison so the hash check can't be timed. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) return fail(req, 400, 'Invalid request.');
    const { id, editToken, browserId } = parsed.data;

    if (!(await withinRateLimit('edit-pin', clientIp(req), browserId, 30))) {
      return fail(req, 429, 'Too many changes today. Try again tomorrow.');
    }

    const { data: pin, error } = await admin
      .from('pins')
      .select('id, edit_token_hash, status')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;

    // Same message for "not found" and "wrong token" so ids can't be probed.
    if (!pin || pin.status === 'archived' || !safeEqual(pin.edit_token_hash, await sha256(editToken))) {
      return fail(req, 403, 'You can only delete pins added from this device.');
    }

    const { error: upErr } = await admin.from('pins').update({ status: 'archived' }).eq('id', id);
    if (upErr) throw upErr;
    // Archived pins lose any contact immediately (cleanup() also does this nightly).
    await admin.from('pin_contacts').delete().eq('pin_id', id);

    return ok(req);
  } catch (e) {
    console.error('edit-pin failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
