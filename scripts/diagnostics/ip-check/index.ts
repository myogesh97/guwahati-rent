// TEMPORARY diagnostic for SECURITY_AUDIT_REPORT.md M-2 / PRODUCTION_READINESS_REPORT.md P0-3. Lives outside
// supabase/functions on purpose, so `supabase functions deploy` (all) never ships it by accident.
// Usage is in scripts/check-client-ip.sh. It never returns or logs an IP address: only which
// headers were present, which one clientIp() used, and whether that value equals the forged one.
import { clientIp } from '../_shared/crypto.ts';
import { safeEqual } from '../_shared/crypto.ts';

const CANDIDATES = [
  'cf-connecting-ip',
  'x-real-ip',
  'x-forwarded-for',
  'x-envoy-external-address',
  'true-client-ip',
];

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (!secret || !safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) {
    return new Response('{"ok":false}', { status: 401 });
  }
  const { forged = '' } = await req.json().catch(() => ({}));
  const first = (name: string) => (req.headers.get(name) ?? '').split(',')[0].trim();
  const headers = Object.fromEntries(
    CANDIDATES.map((h) => [
      h,
      { present: req.headers.has(h), firstIsForged: !!forged && first(h) === forged },
    ]),
  );
  const chosen = clientIp(req);
  return new Response(
    JSON.stringify({
      ok: true,
      pinned: Deno.env.get('CLIENT_IP_HEADER') ?? null,
      chosenIsUnknown: chosen === 'unknown',
      chosenIsForged: !!forged && chosen === forged,
      headers,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
