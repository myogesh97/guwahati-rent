// Phase 2a: shared To-Let rules and wording (NEXT-PHASES §1b, §2a.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TOLET_LIFETIME_DAYS,
  TOLET_MAX_BYTES,
  round3,
  round4,
} from '../supabase/functions/_shared/rules.ts';
import { expiresIn } from '../src/format.ts';

test('boards round to 4 dp (~11 m), rent pins stay at 3 dp', () => {
  assert.equal(round4(26.14567), 26.1457);
  assert.equal(round4(91.79123), 91.7912);
  assert.equal(round3(26.14567), 26.146);
});

test('"Expires in N days" wording', () => {
  const now = Date.UTC(2026, 9, 31, 12);
  const at = (days: number) => new Date(now + days * 86400000).toISOString();
  assert.equal(expiresIn(at(60), now), 'Expires in 60 days');
  assert.equal(expiresIn(at(1.5), now), 'Expires in 2 days');
  assert.equal(expiresIn(at(1), now), 'Expires tomorrow');
  assert.equal(expiresIn(at(0.2), now), 'Expires tomorrow');
  assert.equal(expiresIn(at(0), now), 'Expires today');
  assert.equal(expiresIn(at(-3), now), 'Expires today');
});

test('lifetime and size limit match migration 0004', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/0004_tolet_and_survey.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, new RegExp(`now\\(\\) \\+ interval '${TOLET_LIFETIME_DAYS} days'`));
  assert.match(sql, new RegExp(`file_size_limit = ${TOLET_MAX_BYTES}\\b`));
});

test('public_pins in 0004 repeats 0003 exactly and only appends source, location_approx', () => {
  const cols = (file: string) => {
    const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
    const body = sql.slice(sql.indexOf('create or replace view public.public_pins'));
    return body
      .slice(body.indexOf('select') + 6, body.indexOf('from public.pins'))
      .replace(/extensions\.st_[xy]\([^)]*\)\s+as\s+/g, '')
      .split(',')
      .map((c) => c.trim());
  };
  const before = cols('0003_living_conditions.sql');
  const after = cols('0004_tolet_and_survey.sql');
  assert.deepEqual(after.slice(0, before.length), before);
  assert.deepEqual(after.slice(before.length), ['source', 'location_approx']);
});
