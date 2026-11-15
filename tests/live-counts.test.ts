import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveCounts, liveCountsText } from '../src/live-counts.ts';
import { POLICY } from '../src/config.ts';

const pins = (n: number, slugs = ['beltola', 'dispur', null]) =>
  Array.from({ length: n }, (_, i) => ({
    locality_slug: slugs[i % slugs.length],
    created_at: `2026-11-${String(1 + (i % 14)).padStart(2, '0')}T10:00:00Z`,
  }));

test('counts rents, distinct localities and the newest date', () => {
  assert.deepEqual(liveCounts(pins(6)), {
    rents: 6,
    localities: 2,
    latest: '2026-11-06T10:00:00Z',
  });
  assert.deepEqual(liveCounts([]), { rents: 0, localities: 0, latest: null });
});

test(`hidden below ${POLICY.liveCountsMin} rents`, () => {
  assert.equal(liveCountsText(liveCounts(pins(POLICY.liveCountsMin - 1))), null);
  assert.equal(liveCountsText(liveCounts([])), null);
});

test('exact numbers only: no "+", no rounding up, no sums', () => {
  const t = liveCountsText(liveCounts(pins(1234)))!;
  assert.equal(t, '1,234 rents · 2 localities · updated 14 Nov 2026');
  assert.doesNotMatch(t, /\+|₹/);
});
