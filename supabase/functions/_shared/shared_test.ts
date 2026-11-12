// Deno unit tests for the Edge Function helpers that Node cannot import (they read Deno.env).
// Run: npm run test:deno   (= deno test --allow-env supabase/functions)
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { clientIp, ipHash, randomToken, rateLimitKeys, safeEqual, saltedHash, sha256 } from './crypto.ts';
import { nearestLocality, toWkt, toWkt4 } from './geo.ts';
import { LOCALITIES } from './localities.ts';
import { checkPin, PinFields, pinColumns } from './pin-fields.ts';

const req = (headers: Record<string, string>) => new Request('https://x.test/', { method: 'POST', headers });

Deno.test('clientIp prefers platform-set headers over the client-controlled X-Forwarded-For', () => {
  Deno.env.delete('CLIENT_IP_HEADER');
  assertEquals(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2', 'cf-connecting-ip': '9.9.9.9' })), '9.9.9.9');
  assertEquals(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2', 'x-real-ip': '8.8.8.8' })), '8.8.8.8');
  assertEquals(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })), '1.1.1.1');
  assertEquals(clientIp(req({})), 'unknown');
});

Deno.test('CLIENT_IP_HEADER pins the source header and ignores the others', () => {
  Deno.env.set('CLIENT_IP_HEADER', 'x-envoy-external-address');
  try {
    assertEquals(clientIp(req({ 'x-envoy-external-address': '5.5.5.5', 'cf-connecting-ip': '9.9.9.9' })), '5.5.5.5');
    assertEquals(clientIp(req({ 'cf-connecting-ip': '9.9.9.9' })), 'unknown');
  } finally {
    Deno.env.delete('CLIENT_IP_HEADER');
  }
});

Deno.test('ipHash is null for an unknown IP (so unknowns never collide) and salted otherwise', async () => {
  Deno.env.set('HASH_SALT', 'test-salt');
  try {
    assertEquals(await ipHash(req({})), null);
    const a = await ipHash(req({ 'cf-connecting-ip': '1.2.3.4' }));
    assertEquals(a, await sha256('ip:1.2.3.4test-salt'));
    assertNotEquals(a, await saltedHash('1.2.3.4'));
  } finally {
    Deno.env.delete('HASH_SALT');
  }
});

Deno.test('saltedHash refuses to run without HASH_SALT', async () => {
  Deno.env.delete('HASH_SALT');
  let threw = false;
  try {
    await saltedHash('x');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('safeEqual and randomToken', () => {
  assert(safeEqual('abc', 'abc'));
  assert(!safeEqual('abc', 'abd'));
  assert(!safeEqual('abc', 'abcd'));
  const t = randomToken();
  assert(t.length >= 40 && /^[A-Za-z0-9_-]+$/.test(t), t);
  assertNotEquals(randomToken(), randomToken());
});

Deno.test('coordinates: rent pins 3 dp, boards 4 dp, nearest locality within 3 km', () => {
  assertEquals(toWkt(26.12345, 91.79876), 'SRID=4326;POINT(91.799 26.123)');
  assertEquals(toWkt4(26.12347, 91.79876), 'SRID=4326;POINT(91.7988 26.1235)');
  assertEquals(nearestLocality(26.121, 91.797, LOCALITIES), 'beltola');
  assertEquals(nearestLocality(26.24, 91.56, LOCALITIES), null); // bbox corner, > 3 km from any centre
});

Deno.test('To-Let storage paths and EWKB decoding', async () => {
  // tolet.ts builds the service-role client on import; give it inert values (no request is made).
  Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:1');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-key');
  const { pendingPaths, pointFromEwkb, publicPath } = await import('./tolet.ts');
  assertEquals(pendingPaths('abc', 'webp'), { full: 'pending/abc/full.webp', thumb: 'pending/abc/thumb.webp' });
  assertEquals(publicPath('abc', 'pending/abc/full.webp'), 'abc/full.webp');
  // SRID 4326 point, little-endian: lng 91.797, lat 26.121
  const le = (n: number) => {
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, n, true);
    return [...new Uint8Array(b.buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const hex = '0101000020E6100000' + le(91.797) + le(26.121);
  assertEquals(pointFromEwkb(hex), { lng: 91.797, lat: 26.121 });
  assertEquals(pointFromEwkb({ type: 'Point', coordinates: [91.7, 26.1] }), { lng: 91.7, lat: 26.1 });
  assertEquals(pointFromEwkb('nope'), null);
});

Deno.test('PinFields + checkPin: prunes, derives the waterlogging summary, rejects contact info and bad rents', () => {
  const base = {
    kind: 'rent',
    property_type: 'flat',
    bhk: 2,
    rent: 12000,
    furnishing: 'semi',
    gated: false,
    parking_cars: 0,
  };
  const ok = PinFields.safeParse({ ...base, waterlog_answer: 'yes', waterlog_where: ['access_road'], water_availability: '24h', water_litres: 500 });
  assert(ok.success);
  const c = checkPin(ok.data);
  assert(c.ok);
  const cols = pinColumns(c.p, c.bhk);
  assertEquals(cols.waterlogging, 'road_only');
  assertEquals(cols.water_litres, null, 'litres dropped for 24h water');

  const phone = PinFields.safeParse({ ...base, one_liner: 'call 98640 12345' });
  assert(phone.success);
  const pc = checkPin(phone.data);
  assert(!pc.ok && pc.fields.includes('one_liner'));

  const cheap = PinFields.safeParse({ ...base, rent: 900 });
  assert(cheap.success);
  const rc = checkPin(cheap.data);
  assert(!rc.ok && rc.fields.includes('rent'));

  const pg = PinFields.safeParse({ ...base, property_type: 'pg', bhk: 3, rent: 5000, pg_meals: true });
  assert(pg.success);
  const pgc = checkPin(pg.data);
  assert(pgc.ok && pgc.bhk === 0, 'PG always stores bhk 0');
  assertEquals(pinColumns(pgc.p, pgc.bhk).pg_meals, true);
  assertEquals(pinColumns(c.p, c.bhk).pg_meals, null, 'PG fields dropped for non-PG');

  assert(!PinFields.safeParse({ ...base, kind: 'listing_whole' }).success, 'only rent pins for now');
  assert(!PinFields.safeParse({ ...base, one_liner: 'x'.repeat(151) }).success);
});

Deno.test('rateLimitKeys: IP + browser counters, same key format as before; unknown IP never shares a bucket', async () => {
  Deno.env.set('HASH_SALT', 'test-salt');
  try {
    assertEquals(await rateLimitKeys('1.2.3.4', 'browser-1'), [
      await sha256('1.2.3.4test-salt'),
      await sha256('browser-1test-salt'),
    ]);
    // Two different users without a client IP must not end up in one shared 'unknown' counter.
    const a = await rateLimitKeys('unknown', 'browser-a');
    const b = await rateLimitKeys('unknown', 'browser-b');
    assertEquals(a, [await sha256('browser-atest-salt')]);
    assertEquals(b.length, 1);
    assert(!a.includes(await sha256('unknowntest-salt')));
  } finally {
    Deno.env.delete('HASH_SALT');
  }
});
