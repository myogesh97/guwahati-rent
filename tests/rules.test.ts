// Unit tests for the rules shared by the browser and the Edge Functions.
// Run: npm test (Node's built-in runner; Node 22.18+ strips the TypeScript types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conditionProblems,
  inGuwahati,
  pruneConditions,
  rentProblem,
  round3,
  waterlogSummary,
} from '../supabase/functions/_shared/rules.ts';

test('plausibility bands (SPEC §10)', () => {
  assert.equal(rentProblem('flat', 2, 12000), null);
  assert.match(rentProblem('flat', 2, 4000) ?? '', /between ₹5,000 and ₹90,000/);
  assert.equal(rentProblem('pg', 0, 1500), null);
  assert.notEqual(rentProblem('1rk', 0, 25000), null);
});

test('bbox and rounding', () => {
  assert.equal(inGuwahati(26.14, 91.73), true);
  assert.equal(inGuwahati(28.6, 77.2), false);
  assert.equal(round3(26.12345), 26.123);
});

test('24-hour water: quantity and hours are dropped', () => {
  const c = pruneConditions({
    water_availability: '24h',
    water_litres: 500,
    water_hours: '6-8 am',
  });
  assert.equal(c.water_litres, undefined);
  assert.equal(c.water_hours, undefined);
});

test('scheduled daily supply keeps hours and quantity', () => {
  const c = pruneConditions({
    water_availability: 'daily_fixed',
    water_litres: 800,
    water_hours: '6-8 am',
  });
  assert.equal(c.water_litres, 800);
  assert.equal(c.water_hours, '6-8 am');
});

test('500 L on alternate days is stored as 500 per supply day, unchanged', () => {
  const c = pruneConditions({ water_availability: 'alternate_day', water_litres: 500 });
  assert.equal(c.water_availability, 'alternate_day');
  assert.equal(c.water_litres, 500); // not halved, not treated as daily
});

test('unknown water quantity is fine', () => {
  const c = pruneConditions({ water_availability: 'daily_limited' });
  assert.equal(c.water_litres, undefined);
  assert.deepEqual(conditionProblems(c), []);
});

test('street-only waterlogging does not become "enters premises"', () => {
  assert.equal(waterlogSummary('yes', ['access_road']), 'road_only');
});

test('indoor waterlogging becomes "enters premises"', () => {
  assert.equal(waterlogSummary('yes', ['access_road', 'inside_home']), 'enters_premises');
  assert.equal(waterlogSummary('yes', ['parking']), 'enters_premises');
});

test('wider-area-only flooding is not attributed to this property', () => {
  assert.equal(waterlogSummary('yes', ['neighbourhood']), 'unknown');
});

test('no verified flood info stays unknown', () => {
  assert.equal(waterlogSummary(undefined, undefined), 'unknown');
  assert.equal(waterlogSummary('unknown', ['inside_home']), 'unknown');
  assert.equal(waterlogSummary('no', undefined), 'none');
});

test('"yes" needs at least one place; detail is dropped when not "yes"', () => {
  assert.deepEqual(
    conditionProblems({ waterlog_answer: 'yes' }).map((p) => p.field),
    ['waterlog_where'],
  );
  const c = pruneConditions({
    waterlog_answer: 'no',
    waterlog_where: ['parking'],
    waterlog_severity: 'severe',
  });
  assert.equal(c.waterlog_where, undefined);
  assert.equal(c.waterlog_severity, undefined);
});

test('maintenance amount only when paid separately', () => {
  assert.equal(
    pruneConditions({ maintenance_incl: true, maintenance_amount: 1500 }).maintenance_amount,
    undefined,
  );
  assert.equal(
    pruneConditions({ maintenance_incl: false, maintenance_amount: 1500 }).maintenance_amount,
    1500,
  );
});

test('conditions date cannot be in the future or invalid', () => {
  const today = new Date(2026, 9, 29);
  assert.deepEqual(conditionProblems({ conditions_as_of: '2026-10-29' }, today), []);
  // a UTC server just after midnight IST still accepts the user's "today"
  assert.deepEqual(conditionProblems({ conditions_as_of: '2026-10-30' }, today), []);
  assert.equal(
    conditionProblems({ conditions_as_of: '2026-11-02' }, today)[0]?.field,
    'conditions_as_of',
  );
  assert.equal(
    conditionProblems({ conditions_as_of: '1990-01-01' }, today)[0]?.field,
    'conditions_as_of',
  );
});

test('pruning never mutates the input', () => {
  const input = { water_availability: '24h', water_litres: 500 };
  pruneConditions(input);
  assert.equal(input.water_litres, 500);
});

test('map price labels never round by more than ₹50', async () => {
  const { shortRupees } = await import('../src/format.ts');
  assert.equal(shortRupees(10500), '₹10.5k');
  assert.equal(shortRupees(14000), '₹14k');
  assert.equal(shortRupees(8500), '₹8.5k');
  assert.equal(shortRupees(150000), '₹1.5L');
});
