// Phase 2 filters (NEXT-PHASES §4.3): URL round trip, defaults, and what each filter keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FILTERS,
  activeCount,
  applyFilters,
  parseFilters,
  writeFilters,
  type Filters,
} from '../src/filters.ts';
import type { PublicPin } from '../src/types.ts';

const NOW = Date.UTC(2026, 9, 31);
const ago = (days: number) => new Date(NOW - days * 86400000).toISOString();
const pin = (o: Partial<PublicPin>): PublicPin =>
  ({
    id: Math.random().toString(36),
    kind: 'rent',
    property_type: 'flat',
    bhk: 2,
    rent: 15000,
    furnishing: 'semi',
    gated: false,
    waterlogging: 'unknown',
    created_at: ago(10),
    lat: 26.14,
    lng: 91.79,
    ...o,
  }) as PublicPin;

test('defaults: empty URL, posted within 18 months', () => {
  assert.deepEqual(parseFilters(new URLSearchParams('')), DEFAULT_FILTERS);
  assert.equal(writeFilters(DEFAULT_FILTERS, new URLSearchParams('')).toString(), '');
  assert.equal(activeCount(DEFAULT_FILTERS), 0);
});

test('URL round trip keeps other params and drops junk', () => {
  const f: Filters = {
    ...DEFAULT_FILTERS,
    boards: false,
    bhk: ['2', '0'],
    min: 5000,
    max: 20000,
    furnishing: ['furnished'],
    gated: 'yes',
    types: ['flat', 'pg'],
    dry: true,
    since: 'all',
  };
  const q = writeFilters(f, new URLSearchParams('pin=abc&view=list'));
  assert.equal(q.get('pin'), 'abc');
  assert.equal(q.get('view'), 'list');
  assert.deepEqual(parseFilters(q), { ...f, bhk: ['0', '2'] });
  assert.equal(activeCount(f), 8);
  const junk = parseFilters(
    new URLSearchParams('bhk=9,x,2&furn=gold&since=forever&min=-5&gated=maybe'),
  );
  assert.deepEqual(junk, { ...DEFAULT_FILTERS, bhk: ['2'] });
});

test('18-month default hides old rents; "all" shows them', () => {
  const pins = [pin({ created_at: ago(30) }), pin({ created_at: ago(600) })];
  assert.equal(applyFilters(pins, DEFAULT_FILTERS, NOW).length, 1);
  assert.equal(applyFilters(pins, { ...DEFAULT_FILTERS, since: 'all' }, NOW).length, 2);
  assert.equal(applyFilters(pins, { ...DEFAULT_FILTERS, since: '30d' }, NOW).length, 1);
});

test('each filter keeps the right pins', () => {
  const pins = [
    pin({ bhk: 0, property_type: 'pg', rent: 6000 }),
    pin({ bhk: 1, rent: 9000, gated: true }),
    pin({ bhk: 2, furnishing: 'furnished', waterlogging: 'enters_premises' }),
    pin({ bhk: 5, rent: 40000, property_type: 'independent' }),
  ];
  const n = (f: Partial<Filters>) => applyFilters(pins, { ...DEFAULT_FILTERS, ...f }, NOW).length;
  assert.equal(n({ bhk: ['0'] }), 1);
  assert.equal(n({ bhk: ['4'] }), 1); // 5 BHK counts as 4+
  assert.equal(n({ min: 8000, max: 20000 }), 2);
  assert.equal(n({ furnishing: ['furnished'] }), 1);
  assert.equal(n({ gated: 'yes' }), 1);
  assert.equal(n({ gated: 'no' }), 3);
  assert.equal(n({ types: ['independent', 'pg'] }), 2);
  assert.equal(n({ dry: true }), 3);
  assert.equal(n({ rents: false }), 0);
});
