import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highRentMedian } from '../src/double-check.ts';
import type { LocalityStat } from '../src/types.ts';

const stats = [
  { locality_slug: 'beltola', bhk: 2, n: 6, median_rent: 12000 },
  { locality_slug: 'dispur', bhk: 2, n: 4, median_rent: 12000 }, // too few to judge
] as LocalityStat[];

test('asks only above 2× the median, with 5+ pins of the same BHK in the area', () => {
  assert.equal(highRentMedian(24001, 'beltola', 2, stats), 12000);
  assert.equal(highRentMedian(24000, 'beltola', 2, stats), null); // exactly 2× is fine
  assert.equal(highRentMedian(90000, 'dispur', 2, stats), null);
  assert.equal(highRentMedian(90000, 'beltola', 3, stats), null);
  assert.equal(highRentMedian(90000, null, 2, stats), null);
});
