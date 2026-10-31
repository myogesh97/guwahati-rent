// NEXT-PHASES §4.1 report-pin: anyone can flag a pin (reason + optional private message).
// One report per pin per browser (unique constraint); 3 open reports auto-hide the pin until an
// admin decides (trigger in migration 0006). Messages are private: admins only, never public.
import { z } from 'npm:zod@3';
import { admin } from '../_shared/supabase.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { withinRateLimit } from '../_shared/ratelimit.ts';
import { clientIp, saltedHash } from '../_shared/crypto.ts';
import { fail, ok, preflight, readJson } from '../_shared/http.ts';
import { REPORT_MESSAGE_MAX, REPORT_REASONS, cleanMessage } from '../_shared/rules.ts';
import { failedFields } from '../_shared/pin-fields.ts';

const Body = z.object({
  pinId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  message: z.string().max(REPORT_MESSAGE_MAX).optional(),
  browserId: z.string().min(8).max(100),
  turnstileToken: z.string().min(1).max(10000),
});

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) {
      const fields = failedFields(parsed.error);
      console.warn('report-pin validation failed:', fields.join(', '));
      return fail(req, 400, 'Please choose a reason (and keep the note under 300 characters).', { fields });
    }
    const b = parsed.data;
    const ip = clientIp(req);

    if (!(await verifyTurnstile(b.turnstileToken, ip))) {
      return fail(req, 403, 'Spam check failed. Please refresh the check and try again.');
    }

    const { data: pin, error } = await admin.from('pins').select('id, status').eq('id', b.pinId).maybeSingle();
    if (error) throw error;
    if (!pin || pin.status !== 'active') return fail(req, 404, 'This pin is no longer on the map.');

    if (!(await withinRateLimit('report-pin', ip, b.browserId, 10))) {
      return fail(req, 429, 'Too many reports today. Try again tomorrow.');
    }

    const { error: insErr } = await admin.from('reports').insert({
      pin_id: b.pinId,
      reporter_hash: await saltedHash(b.browserId),
      reason: b.reason,
      message: cleanMessage(b.message),
    });
    // 23505: this browser already reported this pin. Counted once; tell them kindly.
    if (insErr?.code === '23505') return ok(req, { already: true });
    if (insErr) throw insErr;

    return ok(req, { already: false });
  } catch (e) {
    console.error('report-pin failed:', e instanceof Error ? e.message : 'unknown');
    return fail(req, 500, 'Something went wrong on our side. Please try again in a minute.');
  }
});
