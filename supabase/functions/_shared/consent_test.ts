// deno test --allow-env  (from supabase/functions). PHASE-2C §2c.2-C.
import { assertEquals } from 'jsr:@std/assert@1';
import { CONSENT_MESSAGE, hasConsent, requireConsent } from './consent.ts';

Deno.test('consent: only a literal true counts', () => {
  assertEquals(hasConsent({ consent: true }), true);
  for (const b of [
    {},
    { consent: 'true' },
    { consent: 1 },
    { consent: false },
    null,
    'consent',
    [],
  ])
    assertEquals(hasConsent(b), false, JSON.stringify(b));
});

Deno.test('consent: missing -> 400 { field: "consent" }; present -> no response', async () => {
  const req = new Request('https://x.test/functions/v1/submit-pin', { method: 'POST' });
  const res = requireConsent(req, { rent: 12000 })!;
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    ok: false,
    error: CONSENT_MESSAGE,
    field: 'consent',
    fields: ['consent'],
  });
  assertEquals(requireConsent(req, { rent: 12000, consent: true }), null);
});
