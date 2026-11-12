// Survey import logic (NEXT-PHASES §3.3, §3.5): CSV parsing, label mapping, consent, plausibility,
// deterministic jitter, idempotent refs, and the key guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jitter, looksLikePublicKey, mapHeaders, mapRow, parseCsv } from '../scripts/survey.ts';
import { inGuwahati } from '../supabase/functions/_shared/rules.ts';

const HEADER =
  'Timestamp,Area / locality,Nearby landmark,Type of home,Bedrooms,Monthly rent in ₹,Furnishing,Gated society?,Does it waterlog in the monsoon?,Consent';
const row = (o: Partial<Record<string, string>> = {}) =>
  [
    o.ts ?? '2026/11/01 10:00:00',
    o.loc ?? 'Beltola',
    o.landmark ?? 'near the bazaar, 2nd lane',
    o.type ?? 'Flat',
    o.bhk ?? '2',
    o.rent ?? '12,000',
    o.furn ?? 'Semi',
    o.gated ?? 'No',
    o.water ?? 'Road only',
    o.consent ?? 'I agree this rent can be shown anonymously on a public map of Guwahati rents',
  ]
    .map((v) => (v.includes(',') ? `"${v}"` : v))
    .join(',');

const parse = (lines: string[]) => {
  const rows = parseCsv([HEADER, ...lines].join('\n'));
  const idx = mapHeaders(rows[0]);
  assert.ok(!('missing' in idx), 'headers map');
  return rows.slice(1).map((r) => mapRow(r, idx as Exclude<typeof idx, { missing: unknown }>));
};

test('CSV parser handles quoted commas, doubled quotes, CRLF and a BOM', () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n2,,\n');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'say "hi"'],
    ['2', '', ''],
  ]);
});

test('a consented, plausible row becomes a survey pin at the locality centre ±150 m, 3 dp', () => {
  const [r] = parse([row()]);
  assert.ok(r.ok);
  const p = r.pin;
  assert.equal(p.source, 'survey');
  assert.equal(p.location_approx, true);
  assert.equal(p.locality_slug, 'beltola');
  assert.deepEqual(
    [p.property_type, p.bhk, p.rent, p.furnishing, p.gated],
    ['flat', 2, 12000, 'semi', false],
  );
  assert.equal(p.waterlogging, 'road_only');
  assert.deepEqual(p.waterlog_where, ['access_road']);
  assert.equal(Math.round(p.lat * 1000) / 1000, p.lat);
  assert.ok(inGuwahati(p.lat, p.lng));
  const d = Math.hypot(
    (p.lat - 26.121) * 111_320,
    (p.lng - 91.797) * 111_320 * Math.cos((26.121 * Math.PI) / 180),
  );
  assert.ok(d <= 150 + 80, `jitter ${d} m (150 m + 3 dp rounding)`); // 3 dp rounding adds up to ~78 m
});

test('rows without consent, unknown localities and implausible rents are skipped with a reason', () => {
  const rs = parse([
    row({ consent: '' }),
    row({ loc: 'Other' }),
    row({ rent: '500' }),
    row({ type: 'Flat', bhk: 'Not applicable' }),
    row({ type: 'Castle' }),
  ]);
  assert.deepEqual(
    rs.map((r) => (r.ok ? 'ok' : r.reason.split(' ')[0])),
    ['no', 'unknown', 'implausible', 'flat/house', 'unknown'],
  );
});

test('label mapping: House → independent, PG/1RK/Room → bhk 0, "Water comes in" → enters_premises, "Not sure" → unknown', () => {
  const rs = parse([
    row({ type: 'House', bhk: '3', rent: '15000', water: 'Water comes in' }),
    row({ type: 'PG', bhk: 'Not applicable', rent: '5000', water: 'Not sure' }),
    row({ type: '1RK', bhk: '', rent: '6000', water: 'No' }),
  ]);
  assert.ok(rs.every((r) => r.ok));
  const [h, pg, rk] = rs.map((r) => (r.ok ? r.pin : null)!);
  assert.deepEqual(
    [h.property_type, h.bhk, h.waterlogging, h.waterlog_where],
    ['independent', 3, 'enters_premises', ['inside_home']],
  );
  assert.deepEqual([pg.property_type, pg.bhk, pg.waterlogging], ['pg', 0, 'unknown']);
  assert.deepEqual([rk.property_type, rk.bhk, rk.waterlogging], ['1rk', 0, 'none']);
});

test('the same row always gets the same import_ref and the same spot; a different row a different one', () => {
  const [a] = parse([row()]);
  const [b] = parse([row()]);
  const [c] = parse([row({ rent: '12,500' })]);
  assert.ok(a.ok && b.ok && c.ok);
  assert.equal(a.pin.import_ref, b.pin.import_ref);
  assert.deepEqual([a.pin.lat, a.pin.lng], [b.pin.lat, b.pin.lng]);
  assert.notEqual(a.pin.import_ref, c.pin.import_ref);
  assert.deepEqual(
    jitter('x', { lat: 26.121, lng: 91.797 }),
    jitter('x', { lat: 26.121, lng: 91.797 }),
  );
});

test('missing columns are reported by name', () => {
  const idx = mapHeaders(['Timestamp', 'Area', 'Rent']);
  assert.ok('missing' in idx);
  assert.ok(idx.missing.includes('consent'));
});

test('the import refuses publishable/anon keys and accepts service-role keys', () => {
  assert.equal(looksLikePublicKey('sb_publishable_abc'), true);
  assert.equal(looksLikePublicKey('sb_secret_abc'), false);
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;
  assert.equal(looksLikePublicKey(jwt('anon')), true);
  assert.equal(looksLikePublicKey(jwt('service_role')), false);
  assert.equal(looksLikePublicKey('garbage'), true);
});
