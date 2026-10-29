// Shared, dependency-free rules used by BOTH the browser (src/) and Edge Functions.
// Keep this file free of Deno/DOM globals and imports so both toolchains can load it.
// SPEC §2 (bbox), §10 (plausibility bands).

export const BBOX = { minLng: 91.55, minLat: 26.05, maxLng: 91.95, maxLat: 26.25 } as const;

export const inGuwahati = (lat: number, lng: number): boolean =>
  lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng;

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export const PROPERTY_TYPES = ['flat', 'independent', 'pg', '1rk', 'room', 'studio'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Property types that have no BHK count (stored as bhk = 0). */
export const NO_BHK_TYPES: readonly PropertyType[] = ['pg', '1rk', 'room', 'studio'];

export const FURNISHING = ['furnished', 'semi', 'unfurnished'] as const;
export const WATERLOG = ['none', 'road_only', 'enters_premises', 'unknown'] as const;
export const WATER_SUPPLY = ['24x7', 'timed', 'tanker', 'unknown'] as const;
export const POWER_BACKUP = ['full', 'partial', 'none', 'unknown'] as const;

/**
 * Plausibility bands (SPEC §10). Starting guesses, NOT market data.
 * Re-tune once ~300 real pins exist.
 */
export function rentBand(propertyType: PropertyType, bhk: number): { min: number; max: number } {
  if (propertyType === 'room' || propertyType === 'pg') return { min: 1500, max: 30000 };
  if (propertyType === '1rk' || propertyType === 'studio') return { min: 2000, max: 20000 };
  if (bhk <= 1) return { min: 3000, max: 45000 };
  if (bhk === 2) return { min: 5000, max: 90000 };
  if (bhk === 3) return { min: 7000, max: 150000 };
  return { min: 10000, max: 300000 };
}

export function rentProblem(propertyType: PropertyType, bhk: number, rent: number): string | null {
  const { min, max } = rentBand(propertyType, bhk);
  if (!Number.isFinite(rent)) return 'Enter the monthly rent in rupees.';
  if (rent < min || rent > max) {
    return `That rent looks off for this type of home. Expected between ₹${min.toLocaleString('en-IN')} and ₹${max.toLocaleString('en-IN')} a month.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Living conditions (migration 0003). Values MUST match the CHECK constraints there.
// Everything is optional: missing = "not reported". Nothing here assumes Guwahati
// homes lack water or flood; it only records what a renter says about one home.
// ---------------------------------------------------------------------------

export const WATER_SOURCES = ['piped', 'borewell', 'well', 'tanker', 'shared_tank', 'other'] as const;
export const WATER_AVAILABILITY = [
  '24h',
  'daily_fixed',
  'daily_limited',
  'alternate_day',
  'irregular',
  'unknown',
] as const;
/** Availabilities where a quantity / supply hours make sense. */
export const WATER_SCHEDULED: readonly string[] = ['daily_fixed', 'daily_limited', 'alternate_day', 'irregular'];
export const WATER_EXTRA_COST = ['none', 'tanker', 'charge', 'both'] as const;
export const DRINKING_WATER = ['supplied', 'purifier', 'buy_cans', 'boil_filter', 'other'] as const;

export const WATERLOG_ANSWERS = ['no', 'yes', 'unknown'] as const;
export const WATERLOG_PLACES = [
  'access_road',
  'neighbourhood',
  'entrance',
  'parking',
  'ground_floor',
  'inside_home',
] as const;
/** Places that mean water reached the property itself (vs the street / wider area). */
export const PREMISES_PLACES: readonly string[] = ['entrance', 'parking', 'ground_floor', 'inside_home'];
export const WATERLOG_SEVERITY = ['minor', 'moderate', 'severe'] as const;
export const WATERLOG_DURATION = ['under_3h', '3_to_12h', '12_to_48h', 'over_48h'] as const;
export const ROAD_IN_RAIN = ['usable', 'difficult', 'cut_off'] as const;
export const FLOOR_LEVEL = ['ground', 'upper', 'whole_house'] as const;
export const POWER_CUTS = ['rare', 'weekly', 'daily', 'several_daily'] as const;

export const LIMITS = {
  waterLitres: { min: 20, max: 20000 },
  maintenance: { min: 0, max: 50000 },
  deposit: { min: 0, max: 12 },
  sqft: { min: 80, max: 10000 },
  parking: { min: 0, max: 5 },
} as const;

type Waterlog = (typeof WATERLOG)[number];

/**
 * The map/stats summary (`pins.waterlogging`) derived from the detailed answer.
 * Street-only or neighbourhood-only reports never become "enters premises".
 * A neighbourhood-only report is not about this property's road, so it stays 'unknown'.
 */
export function waterlogSummary(answer: string | undefined, where: readonly string[] | undefined): Waterlog {
  if (answer === 'no') return 'none';
  if (answer !== 'yes') return 'unknown';
  const w = where ?? [];
  if (w.some((p) => PREMISES_PLACES.includes(p))) return 'enters_premises';
  if (w.includes('access_road')) return 'road_only';
  return 'unknown';
}

export interface Conditions {
  water_availability?: string;
  water_litres?: number;
  water_hours?: string | null;
  waterlog_answer?: string;
  waterlog_where?: string[];
  waterlog_severity?: string;
  waterlog_duration?: string;
  road_in_rain?: string;
  maintenance_incl?: boolean;
  maintenance_amount?: number;
  conditions_as_of?: string;
}

/**
 * Drops answers that don't apply given earlier answers (e.g. litres for 24-hour water,
 * flood detail when it doesn't waterlog). The browser hides the same fields, so nothing
 * the user can see is discarded. Returns a new object.
 */
export function pruneConditions<T extends Conditions>(c: T): T {
  const out = { ...c };
  if (!out.water_availability || !WATER_SCHEDULED.includes(out.water_availability)) {
    delete out.water_litres;
    delete out.water_hours;
  }
  if (out.waterlog_answer !== 'yes') {
    delete out.waterlog_where;
    delete out.waterlog_severity;
    delete out.waterlog_duration;
    delete out.road_in_rain;
  }
  if (out.maintenance_incl !== false) delete out.maintenance_amount;
  return out;
}

/** Cross-field problems, as { field, message } for inline display. Empty array = fine. */
export function conditionProblems(c: Conditions, today = new Date()): { field: string; message: string }[] {
  const out: { field: string; message: string }[] = [];
  if (c.waterlog_answer === 'yes' && !(c.waterlog_where && c.waterlog_where.length)) {
    out.push({ field: 'waterlog_where', message: 'Pick at least one place where the water collects.' });
  }
  if (c.conditions_as_of) {
    const d = new Date(`${c.conditions_as_of}T00:00:00Z`);
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.UTC(2000, 0, 1)) {
      out.push({ field: 'conditions_as_of', message: 'Enter a valid date.' });
    } else if (d.getTime() > todayUtc + 86400000) {
      // One day of slack: the server runs in UTC, so an Indian user's "today" can be UTC's tomorrow.
      out.push({ field: 'conditions_as_of', message: "The date can't be in the future." });
    }
  }
  return out;
}
