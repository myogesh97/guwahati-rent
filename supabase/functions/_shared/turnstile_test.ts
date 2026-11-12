// verifyTurnstile against a stubbed siteverify (no network). turnstile.ts reads ALLOWED_ORIGINS
// when it is first imported, so the env is set before a dynamic import.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

Deno.env.set('ALLOWED_ORIGINS', 'http://localhost:5173,https://guwahati-rent.netlify.app');
const { verifyTurnstile, TURNSTILE_ACTION } = await import('./turnstile.ts');

const realFetch = globalThis.fetch;
let sent: FormData | null = null;
function siteverify(answer: Record<string, unknown>, status = 200) {
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    sent = init?.body as FormData;
    return Promise.resolve(new Response(JSON.stringify(answer), { status }));
  }) as typeof fetch;
}

async function withSecret(fn: () => Promise<void>) {
  Deno.env.set('TURNSTILE_SECRET_KEY', 'test-secret');
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete('TURNSTILE_SECRET_KEY');
    sent = null;
  }
}

const good = { success: true, hostname: 'guwahati-rent.netlify.app', action: TURNSTILE_ACTION };

Deno.test('turnstile: a valid token from our host and action passes, and the IP is forwarded', () =>
  withSecret(async () => {
    siteverify(good);
    assertEquals(await verifyTurnstile('tok', '1.2.3.4'), true);
    assertEquals(sent?.get('remoteip'), '1.2.3.4');
    assertEquals(sent?.get('secret'), 'test-secret');
  }),
);

Deno.test('turnstile: an unknown IP is not sent as remoteip', () =>
  withSecret(async () => {
    siteverify(good);
    assertEquals(await verifyTurnstile('tok', 'unknown'), true);
    assertEquals(sent?.get('remoteip'), null);
  }),
);

Deno.test(
  'turnstile: failure, empty token, HTTP error, foreign host and foreign action are refused',
  () =>
    withSecret(async () => {
      siteverify({ ...good, success: false });
      assertEquals(await verifyTurnstile('tok'), false);
      assertEquals(await verifyTurnstile(''), false);
      siteverify(good, 500);
      assertEquals(await verifyTurnstile('tok'), false);
      siteverify({ ...good, hostname: 'evil.example' });
      assertEquals(await verifyTurnstile('tok'), false);
      siteverify({ ...good, action: 'login' });
      assertEquals(await verifyTurnstile('tok'), false);
    }),
);

Deno.test("turnstile: an empty action (Cloudflare's test keys) is still accepted on our host", () =>
  withSecret(async () => {
    siteverify({ ...good, action: '' });
    assertEquals(await verifyTurnstile('tok'), true);
  }),
);

Deno.test('turnstile: a missing secret is a server error, never a silent pass', async () => {
  Deno.env.delete('TURNSTILE_SECRET_KEY');
  await assertRejects(() => verifyTurnstile('tok'), Error, 'TURNSTILE_SECRET_KEY');
});
