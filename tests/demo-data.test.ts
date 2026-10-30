// The "full" demo scenario must be data the real form + submit-pin could have produced:
// every pin passes the shared rules, matches the DB constraints in migration 0003, and
// together the pins use every option the form offers. (Demo data is dev-only; see src/demo.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoPins, SCENARIOS } from '../src/demo/demo-data.ts';
import {
  DRINKING_WATER,
  FLOOR_LEVEL,
  LIMITS,
  NO_BHK_TYPES,
  POWER_BACKUP,
  POWER_CUTS,
  PREMISES_PLACES,
  ROAD_IN_RAIN,
  WATER_AVAILABILITY,
  WATER_EXTRA_COST,
  WATER_SCHEDULED,
  WATERLOG,
  WATERLOG_DURATION,
  WATERLOG_PLACES,
  WATERLOG_SEVERITY,
  conditionProblems,
  inGuwahati,
  rentProblem,
  waterlogSummary,
} from '../supabase/functions/_shared/rules.ts';

const pins = demoPins('full');
const generated = pins.filter((p) => !p.one_liner?.startsWith('Demo scenario:'));
const inRange = (v: number | null | undefined, r: { min: number; max: number }) =>
  v == null || (Number.isInteger(v) && v >= r.min && v <= r.max);

test('500 pins, unique ids, same every run, all inside Guwahati at 3 dp', () => {
  assert.equal(pins.length, SCENARIOS.full);
  assert.equal(new Set(pins.map((p) => p.id)).size, pins.length);
  assert.deepEqual(demoPins('full'), pins);
  for (const p of pins) {
    assert.ok(inGuwahati(p.lat, p.lng), p.id);
    assert.equal(Math.round(p.lat * 1000) / 1000, p.lat);
  }
});

test('every pin follows the form and server rules', () => {
  for (const p of pins) {
    const id = p.id;
    assert.equal(rentProblem(p.property_type, p.bhk ?? 0, p.rent), null, `${id} rent ${p.rent}`);
    assert.equal((p.bhk ?? 0) === 0, NO_BHK_TYPES.includes(p.property_type), `${id} bhk`);
    if (p.property_type !== 'pg')
      assert.ok(p.pg_meals == null && p.pg_gender == null, `${id} pg fields`);
    // litres / hours only with a scheduled supply (constraint pins_water_qty_needs_schedule)
    if (p.water_litres != null || p.water_hours != null) {
      assert.ok(
        WATER_SCHEDULED.includes(p.water_availability ?? ''),
        `${id} litres without schedule`,
      );
    }
    // flood detail only with a place (pins_waterlog_detail_needs_where)
    if (p.waterlog_severity || p.waterlog_duration || p.road_in_rain)
      assert.ok(p.waterlog_where?.length, `${id} detail`);
    // maintenance amount only when paid separately (pins_maint_amount_needs_separate)
    if (p.maintenance_amount != null) assert.equal(p.maintenance_incl, false, `${id} maintenance`);
    // summary agrees with the detail, exactly as submit-pin derives it
    if (p.waterlog_where?.length)
      assert.equal(p.waterlogging, waterlogSummary('yes', p.waterlog_where), `${id} summary`);
    assert.deepEqual(
      conditionProblems(
        {
          ...p,
          waterlog_answer: p.waterlog_where ? 'yes' : undefined,
          conditions_as_of: p.conditions_as_of ?? undefined,
          water_hours: p.water_hours ?? undefined,
        },
        new Date(2026, 9, 1),
      ),
      [],
      id,
    );
    assert.ok(inRange(p.deposit_months, LIMITS.deposit), `${id} deposit`);
    assert.ok(inRange(p.sqft, LIMITS.sqft), `${id} sqft`);
    assert.ok(inRange(p.parking_cars, LIMITS.parking), `${id} parking`);
    assert.ok(inRange(p.water_litres, LIMITS.waterLitres), `${id} litres`);
    assert.ok(inRange(p.maintenance_amount, LIMITS.maintenance), `${id} maintenance amount`);
    for (const [v, max] of [
      [p.one_liner, 150],
      [p.water_note, 150],
      [p.waterlog_note, 150],
      [p.water_hours, 60],
      [p.society_name, 120],
    ] as const) {
      assert.ok(v == null || v.length <= max, `${id} text length`);
    }
    assert.equal(p.water_sources ?? null, null, `${id} water source is no longer asked`);
    assert.equal(p.water_supply, null, `${id} legacy field unused`);
  }
});

test('every option in the form is used somewhere', () => {
  const seen = (key: keyof (typeof pins)[number]) =>
    new Set(generated.flatMap((p) => [p[key]].flat()).filter((v) => v != null));
  const expect: [keyof (typeof pins)[number], readonly unknown[]][] = [
    ['property_type', ['flat', 'independent', '1rk', 'room', 'pg']],
    ['bhk', [0, 1, 2, 3, 4, 5]],
    ['furnishing', ['unfurnished', 'semi', 'furnished']],
    ['gated', [true, false]],
    ['water_availability', WATER_AVAILABILITY],
    ['water_extra_cost', WATER_EXTRA_COST],
    ['water_shared', [true, false]],
    ['drinking_water', DRINKING_WATER],
    ['waterlogging', WATERLOG],
    ['waterlog_where', WATERLOG_PLACES],
    ['waterlog_severity', WATERLOG_SEVERITY],
    ['waterlog_duration', WATERLOG_DURATION],
    ['road_in_rain', ROAD_IN_RAIN],
    ['floor_level', FLOOR_LEVEL],
    ['power_backup', POWER_BACKUP],
    ['power_cuts', POWER_CUTS],
    ['occupants', ['family', 'bachelor']],
    ['maintenance_incl', [true, false]],
    ['pg_meals', [true, false]],
    ['pg_gender', ['boys', 'girls', 'mixed']],
  ];
  for (const [key, options] of expect) {
    const s = seen(key);
    const missing = options.filter((o) => !s.has(o));
    assert.deepEqual(missing, [], `${String(key)} never used: ${missing.join(', ')}`);
  }
  for (const key of [
    'water_litres',
    'water_hours',
    'water_note',
    'waterlog_note',
    'maintenance_amount',
    'conditions_as_of',
    'sqft',
    'deposit_months',
    'society_name',
    'one_liner',
  ] as const) {
    assert.ok(
      generated.some((p) => p[key] != null),
      `${key} never filled`,
    );
  }
});

test('the scenarios people asked about are all present', () => {
  const has = (f: (p: (typeof pins)[number]) => boolean) => generated.some(f);
  assert.ok(
    has((p) => p.water_availability === '24h'),
    '24-hour water',
  );
  assert.ok(
    has((p) => p.water_availability === 'daily_fixed' && p.water_hours != null),
    'scheduled daily',
  );
  assert.ok(
    has((p) => p.water_availability === 'alternate_day' && p.water_litres === 500),
    '500 L every other day',
  );
  assert.ok(
    has((p) => WATER_SCHEDULED.includes(p.water_availability ?? '') && p.water_litres == null),
    'unknown quantity',
  );
  assert.ok(
    has((p) => p.water_extra_cost === 'tanker' || p.water_extra_cost === 'both'),
    'paid tanker',
  );
  assert.ok(
    has(
      (p) =>
        p.waterlogging === 'road_only' &&
        !p.waterlog_where!.some((w) => PREMISES_PLACES.includes(w)),
    ),
    'street only',
  );
  assert.ok(
    has((p) => p.waterlog_where?.includes('inside_home') === true),
    'indoor',
  );
  assert.ok(
    has((p) => p.waterlogging === 'unknown' && p.waterlog_where == null),
    'no flood info',
  );
  assert.ok(
    has(
      (p) =>
        p.waterlog_where?.length === 1 &&
        p.waterlog_where[0] === 'neighbourhood' &&
        p.waterlogging === 'unknown',
    ),
    'wider area only, not attributed',
  );
});
