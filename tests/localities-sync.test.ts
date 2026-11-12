// public/localities.json (browser) and _shared/localities.ts (Edge Functions) must stay identical,
// or a pin can be labelled one locality on the map and another in the database (SPEC §11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOCALITIES } from '../supabase/functions/_shared/localities.ts';
import { inGuwahati } from '../supabase/functions/_shared/rules.ts';

test('the two locality lists are identical and every centre is inside the bbox', () => {
  const json = JSON.parse(
    readFileSync(new URL('../public/localities.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(json, LOCALITIES);
  assert.equal(new Set(LOCALITIES.map((l) => l.slug)).size, LOCALITIES.length, 'unique slugs');
  for (const l of LOCALITIES) {
    assert.ok(inGuwahati(l.lat, l.lng), l.slug);
    assert.match(l.slug, /^[a-z0-9-]+$/);
  }
});
