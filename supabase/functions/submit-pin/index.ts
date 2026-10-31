// SPEC §7.3 submit-pin. Phase 1: rent pins only. Listing path (email/phone/consent) arrives in Phase 3.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, randomToken, sha256 } from '../_shared/crypto.ts';
import { inGuwahati, nearestLocality, round3, toWkt } from '../_shared/geo.ts';
import { LOCALITIES } from '../_shared/localities.ts';
import { PinFields, checkPin, failedFields, pinColumns } from '../_shared/pin-fields.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';

const RentPin = PinFields.extend({
  lat: z.number(),
  lng: z.number(),
  turnstileToken: z.string().min(1).max(10000), // Cloudflare verifies it; length cap only stops abuse
  browserId: z.string().min(8).max(100),
});

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = RentPin.safeParse(await readJson(req));
    if (!parsed.success) {
      // Name the fields (never their values) so problems can be diagnosed from the browser.
      const fields = failedFields(parsed.error);
      console.warn('submit-pin validation failed:', fields.join(', '));
      return fail(req, 400, 'Some answers need fixing. Check the highlighted fields and try again.', {
        fields,
      });
    }
    // Drop answers that don't apply (e.g. litres for 24-hour water), then cross-field + rent checks.
    const checked = checkPin(parsed.data);
    if (!checked.ok) return fail(req, 400, checked.message, { fields: checked.fields });
    const { p, bhk } = checked;

    const ip = clientIp(req);

    if (!(await verifyTurnstile(p.turnstileToken, ip))) {
      return fail(req, 403, 'Spam check failed. Please refresh the check and try again.');
    }
    if (!inGuwahati(p.lat, p.lng)) {
      return fail(req, 400, 'That spot is outside Guwahati. Only Guwahati pins are accepted for now.');
    }

    // Rate limit last, so rejected inputs (typos, wrong spot) don't use up someone's daily quota.
    if (!(await withinRateLimit('submit-pin', ip, p.browserId, 5))) {
      return fail(req, 429, 'You have added the maximum number of pins for today. Try again tomorrow.');
    }

    const lat = round3(p.lat);
    const lng = round3(p.lng);
    const editToken = randomToken();

    const row = {
      ...pinColumns(p, bhk),
      locality_slug: nearestLocality(lat, lng, LOCALITIES),
      location: toWkt(lat, lng),
      edit_token_hash: await sha256(editToken),
    };

    const { data, error } = await admin.from('pins').insert(row).select('id, created_at').single();
    if (error || !data) throw error ?? new Error('insert returned no row');

    // Public shape only (mirrors public_pins). Never echo edit_token_hash.
    const { edit_token_hash: _omit, location: _loc, ...pub } = row;
    return ok(req, {
      id: data.id,
      editToken,
      pin: { ...pub, id: data.id, created_at: data.created_at, is_outlier: false, lat, lng },
    });
  } catch (e) {
    console.error('submit-pin failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
