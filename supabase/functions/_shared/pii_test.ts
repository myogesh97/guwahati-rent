// deno test --allow-env  (from supabase/functions). PHASE-2C §2c.2-A.
import { assertEquals } from 'jsr:@std/assert@1';
import { PII_MESSAGE, scrubPublicText } from './pii.ts';
import { contactProblems } from './rules.ts';

const society = (s: string) => scrubPublicText(s, { units: true });
const kind = (r: ReturnType<typeof scrubPublicText>) => (r.ok ? null : r.kind);

Deno.test('pii: the cases PHASE-2C names', () => {
  assertEquals(kind(society('701 Avalon Heights')), 'unit');
  assertEquals(kind(society('Flat A-302, Green Valley')), 'unit');
  assertEquals(kind(society('call 98xxxxxxxx')), 'contact');
  assertEquals(society('Sunrise Apartments'), { ok: true, value: 'Sunrise Apartments' });
});

Deno.test('pii: phone numbers in any shape', () => {
  for (const s of [
    'call 9864012345',
    '+91-98640-12345',
    '+91 98640 12345',
    '098640 12345',
    'landline 0361 2345678',
    'owner 98xxx xxxxx',
    '+91 98XXXXXXXX',
  ])
    assertEquals(kind(scrubPublicText(s)), 'contact', s);
});

Deno.test('pii: emails and links', () => {
  assertEquals(kind(scrubPublicText('mail someone@example.com')), 'contact');
  for (const s of [
    'see https://x.example/flat',
    'www.brokerflats.in',
    'visit brokerflats.com today',
  ])
    assertEquals(kind(scrubPublicText(s)), 'url', s);
});

Deno.test('pii: flat, house and door numbers in a society name', () => {
  for (const s of [
    'Flat no. 3B, Sunrise',
    'H.No. 12 Lachit Nagar',
    'Apt 4C Royal Enclave',
    'door #7, Green Park',
    'B12 Green Valley',
    'Avalon C 1203',
    'Tower X 1203',
    '302A Hill View',
  ])
    assertEquals(kind(society(s)), 'unit', s);
  for (const s of [
    'Sunrise Apartments',
    'Royal Enclave',
    'Green Valley Phase 2',
    'Tower 2, Block C',
    'Sector 21 Residency',
    'Ganeshguri 781005',
  ])
    assertEquals(society(s).ok, true, s);
});

Deno.test('pii: notes keep ordinary numbers (unit rules are for the society name only)', () => {
  for (const s of ['Water 2 hrs daily, 500 L tank', 'Rent went from 12000 to 14000', 'built 2015'])
    assertEquals(scrubPublicText(s).ok, true, s);
});

Deno.test('pii: empty is fine and trimmed; the message names what to fix', () => {
  assertEquals(scrubPublicText('   '), { ok: true, value: null });
  assertEquals(scrubPublicText(undefined), { ok: true, value: null });
  assertEquals(scrubPublicText('  Hill View  '), { ok: true, value: 'Hill View' });
  const r = society('Flat 302, Sunrise Apartments');
  assertEquals(r.ok ? null : r.message, PII_MESSAGE.unit);
});

Deno.test('pii: contactProblems flags the field, unit rules only on society_name', () => {
  assertEquals(
    contactProblems({ society_name: '701 Avalon Heights', one_liner: '701 steps to the bazaar' }),
    [{ field: 'society_name', message: PII_MESSAGE.unit }],
  );
});
