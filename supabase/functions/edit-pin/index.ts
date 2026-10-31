// SPEC §7.3 edit-pin: the browser holding a pin's edit token can delete it, or (NEXT-PHASES §4.7)
// update its answers with exactly the same validation as submit-pin. Location stays as pinned.
// mark_rented / renew arrive with listings in Phase 3.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, safeEqual, sha256 } from '../_shared/crypto.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';
import { PinFields, checkPin, failedFields, pinColumns } from '../_shared/pin-fields.ts';

const Auth = {
  id: z.string().uuid(),
  editToken: z.string().min(20).max(200),
  browserId: z.string().min(8).max(100),
};
const Body = z.discriminatedUnion('action', [
  z.object({ ...Auth, action: z.literal('delete') }),
  PinFields.extend({ ...Auth, action: z.literal('update') }),
]);

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) {
      const fields = failedFields(parsed.error);
      console.warn('edit-pin validation failed:', fields.join(', '));
      return fail(req, 400, 'Some answers need fixing. Check the highlighted fields and try again.', { fields });
    }
    const body = parsed.data;

    // Cheap checks before the rate limit, so a typo doesn't use up the quota.
    let checked: ReturnType<typeof checkPin> | null = null;
    if (body.action === 'update') {
      checked = checkPin(body);
      if (!checked.ok) return fail(req, 400, checked.message, { fields: checked.fields });
    }

    if (!(await withinRateLimit('edit-pin', clientIp(req), body.browserId, 30))) {
      return fail(req, 429, 'Too many changes today. Try again tomorrow.');
    }

    const { data: pin, error } = await admin
      .from('pins')
      .select('id, edit_token_hash, status, kind')
      .eq('id', body.id)
      .maybeSingle();
    if (error) throw error;

    // Same message for "not found" and "wrong token" so ids can't be probed.
    if (!pin || pin.status === 'archived' || !safeEqual(pin.edit_token_hash, await sha256(body.editToken))) {
      return fail(req, 403, 'You can only change pins added from this device.');
    }

    if (body.action === 'delete') {
      const { error: upErr } = await admin.from('pins').update({ status: 'archived' }).eq('id', body.id);
      if (upErr) throw upErr;
      // Archived pins lose any contact immediately (cleanup() also does this nightly).
      await admin.from('pin_contacts').delete().eq('pin_id', body.id);
      return ok(req);
    }

    if (pin.kind !== 'rent' || !checked?.ok) return fail(req, 400, 'Only rent pins can be edited for now.');
    const { kind: _kind, ...columns } = pinColumns(checked.p, checked.bhk);
    const { error: upErr } = await admin.from('pins').update(columns).eq('id', body.id);
    if (upErr) throw upErr;

    // Hand back the public shape (a hidden pin isn't in the view; then the browser keeps its copy).
    const { data: pub, error: pubErr } = await admin.from('public_pins').select('*').eq('id', body.id).maybeSingle();
    if (pubErr) throw pubErr;
    return ok(req, { pin: pub });
  } catch (e) {
    console.error('edit-pin failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
