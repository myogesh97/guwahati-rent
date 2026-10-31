// Filters (NEXT-PHASES §4.3). Pure functions: parse/serialise the URL query and apply to pins.
// The map and the list both draw `applyFilters(...)`, so cluster counts match what the list shows.
import type { PublicPin } from './types';
import type { PropertyType } from '../supabase/functions/_shared/rules';

export type Since = '30d' | '6m' | '18m' | 'all';
export type BhkBucket = '0' | '1' | '2' | '3' | '4';
export type Furnishing = PublicPin['furnishing'];

export interface Filters {
  rents: boolean;
  boards: boolean;
  bhk: BhkBucket[]; // '0' = room / PG / 1RK / studio, '4' = 4 BHK and up
  min: number | null;
  max: number | null;
  furnishing: Furnishing[];
  gated: 'any' | 'yes' | 'no';
  types: PropertyType[];
  dry: boolean; // hide pins where water enters the property
  since: Since;
}

/** Stats and the default view use the last 18 months (NEXT-PHASES §1b). */
export const DEFAULT_FILTERS: Filters = {
  rents: true,
  boards: true,
  bhk: [],
  min: null,
  max: null,
  furnishing: [],
  gated: 'any',
  types: [],
  dry: false,
  since: '18m',
};

const BHK: readonly BhkBucket[] = ['0', '1', '2', '3', '4'];
const FURN: readonly Furnishing[] = ['unfurnished', 'semi', 'furnished'];
const TYPES: readonly PropertyType[] = ['flat', 'independent', 'pg', '1rk', 'room', 'studio'];
const SINCE: readonly Since[] = ['30d', '6m', '18m', 'all'];
/** The query keys filters own; everything else in the URL (pin, area, demo, view…) is left alone. */
export const FILTER_KEYS = ['show', 'bhk', 'min', 'max', 'furn', 'gated', 'type', 'dry', 'since'];

const list = <T extends string>(v: string | null, allowed: readonly T[]): T[] =>
  v
    ? [...new Set(v.split(',').filter((x): x is T => (allowed as readonly string[]).includes(x)))]
    : [];
const money = (v: string | null): number | null => {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export function parseFilters(q: URLSearchParams): Filters {
  const show = q.get('show');
  const shown = show === null ? null : show.split(',');
  return {
    rents: shown ? shown.includes('rents') : true,
    boards: shown ? shown.includes('boards') : true,
    bhk: list(q.get('bhk'), BHK),
    min: money(q.get('min')),
    max: money(q.get('max')),
    furnishing: list(q.get('furn'), FURN),
    gated: q.get('gated') === '1' ? 'yes' : q.get('gated') === '0' ? 'no' : 'any',
    types: list(q.get('type'), TYPES),
    dry: q.get('dry') === '1',
    since: (SINCE as readonly string[]).includes(q.get('since') ?? '')
      ? (q.get('since') as Since)
      : '18m',
  };
}

/** Writes only non-default values, so the plain URL stays `/`. Other params are kept. */
export function writeFilters(f: Filters, q: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(q);
  for (const k of FILTER_KEYS) out.delete(k);
  if (!f.rents || !f.boards)
    out.set('show', [f.rents && 'rents', f.boards && 'boards'].filter(Boolean).join(','));
  if (f.bhk.length) out.set('bhk', [...f.bhk].sort().join(','));
  if (f.min !== null) out.set('min', String(f.min));
  if (f.max !== null) out.set('max', String(f.max));
  if (f.furnishing.length) out.set('furn', f.furnishing.join(','));
  if (f.gated !== 'any') out.set('gated', f.gated === 'yes' ? '1' : '0');
  if (f.types.length) out.set('type', f.types.join(','));
  if (f.dry) out.set('dry', '1');
  if (f.since !== '18m') out.set('since', f.since);
  return out;
}

/** Number of filter groups changed from the defaults (for the "Filters (n)" button). */
export function activeCount(f: Filters): number {
  return [
    !f.rents || !f.boards,
    f.bhk.length > 0,
    f.min !== null || f.max !== null,
    f.furnishing.length > 0,
    f.gated !== 'any',
    f.types.length > 0,
    f.dry,
    f.since !== '18m',
  ].filter(Boolean).length;
}

const DAY = 86400000;
export function sinceCutoff(since: Since, now = Date.now()): number {
  if (since === '30d') return now - 30 * DAY;
  if (since === '6m') return new Date(now).setMonth(new Date(now).getMonth() - 6);
  if (since === '18m') return new Date(now).setMonth(new Date(now).getMonth() - 18);
  return -Infinity;
}

const bucket = (p: Pick<PublicPin, 'bhk'>): BhkBucket => BHK[Math.min(Math.max(p.bhk ?? 0, 0), 4)];

export function applyFilters(pins: PublicPin[], f: Filters, now = Date.now()): PublicPin[] {
  if (!f.rents) return [];
  const cutoff = sinceCutoff(f.since, now);
  return pins.filter(
    (p) =>
      (cutoff === -Infinity || new Date(p.created_at).getTime() >= cutoff) &&
      (!f.bhk.length || f.bhk.includes(bucket(p))) &&
      (f.min === null || p.rent >= f.min) &&
      (f.max === null || p.rent <= f.max) &&
      (!f.furnishing.length || f.furnishing.includes(p.furnishing)) &&
      (f.gated === 'any' || p.gated === (f.gated === 'yes')) &&
      (!f.types.length || f.types.includes(p.property_type)) &&
      (!f.dry || p.waterlogging !== 'enters_premises'),
  );
}
