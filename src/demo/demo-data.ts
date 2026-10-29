// DEV-ONLY demo dataset for testing the map at different densities.
// Every record is FICTIONAL. Nothing here is written to any database (SPEC §5.13: never invent
// seed data), and this module is only reachable behind `import.meta.env.DEV`, so it is not in
// production builds. Same scenario => same records and coordinates on every run.
import localities from '../../public/localities.json';
import { inGuwahati, rentBand, round3, NO_BHK_TYPES } from '../../supabase/functions/_shared/rules';
import type { PublicPin } from '../types';
import { EXTRA_ANCHORS } from './anchors';

export const DEMO_PREFIX = 'demo-';
export const isDemoId = (id: string): boolean => id.startsWith(DEMO_PREFIX);

export const SCENARIOS = { normal: 25, dense: 80, stress: 260 } as const;
export type Scenario = keyof typeof SCENARIOS;

/** Fixed "now" so created_at values never change between runs. */
const BASE = Date.UTC(2026, 9, 1);

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Anchor = { slug: string | null; name: string; lat: number; lng: number; weight: number };

// Busier, central areas get more pins. Weights are a testing choice, not market data.
const CENTRAL = new Set([
  'ganeshguri',
  'dispur',
  'six-mile',
  'beltola',
  'zoo-road',
  'gs-road',
  'chandmari',
  'ulubari',
  'hatigaon',
  'survey',
]);
const ANCHORS: Anchor[] = [
  ...localities.map((l) => ({ ...l, weight: CENTRAL.has(l.slug) ? 3 : 1 })),
  ...EXTRA_ANCHORS.map((a) => ({ ...a, slug: null, weight: 1 })),
];

const blank = (): Omit<
  PublicPin,
  'id' | 'property_type' | 'bhk' | 'rent' | 'lat' | 'lng' | 'created_at' | 'locality_slug'
> => ({
  kind: 'rent',
  furnishing: 'semi',
  gated: false,
  maintenance_incl: null,
  deposit_months: null,
  sqft: null,
  parking_cars: 0,
  society_name: null,
  occupants: null,
  pets_allowed: null,
  waterlogging: 'unknown',
  water_supply: null,
  power_backup: null,
  pg_meals: null,
  pg_gender: null,
  one_liner: null,
  is_outlier: false,
});

/**
 * Hand-written scenarios that exercise the living-condition fields. Only fields the app actually
 * stores are used. Not representable today (no such columns): separate/shared electricity meter,
 * landlord-direct vs broker + commission, guest/gate rules, AC, internet.
 */
const SCENARIO_PINS: (Partial<PublicPin> & { at: string; note: string })[] = [
  {
    at: 'paltan-bazar',
    note: 'Room with scheduled piped supply',
    property_type: 'room',
    bhk: 0,
    rent: 4500,
    water_availability: 'daily_fixed',
    water_sources: ['piped'],
    water_hours: '6–8 am',
  },
  {
    at: 'beltola',
    note: 'Borewell, supply uncertain in summer',
    property_type: 'flat',
    bhk: 2,
    rent: 13000,
    water_availability: 'irregular',
    water_sources: ['borewell'],
    water_note: 'Borewell runs low in dry months',
  },
  {
    at: 'hatigaon',
    note: '500 litres every other day',
    property_type: 'flat',
    bhk: 2,
    rent: 11500,
    water_availability: 'alternate_day',
    water_litres: 500,
    water_sources: ['piped', 'shared_tank'],
    water_shared: true,
  },
  {
    at: 'lokhra',
    note: 'Pays separately for tanker water',
    property_type: 'independent',
    bhk: 2,
    rent: 9000,
    water_availability: 'daily_limited',
    water_sources: ['tanker', 'well'],
    water_extra_cost: 'tanker',
  },
  {
    at: 'zoo-road',
    note: 'Road waterlogs, no water inside',
    property_type: 'flat',
    bhk: 3,
    rent: 22000,
    waterlogging: 'road_only',
    waterlog_where: ['access_road'],
    waterlog_severity: 'moderate',
    waterlog_duration: '3_to_12h',
    road_in_rain: 'difficult',
    floor_level: 'upper',
  },
  {
    at: 'anil-nagar' /* OSM anchor */,
    note: 'Ground floor, water may enter (unverified)',
    property_type: 'flat',
    bhk: 1,
    rent: 8000,
    waterlogging: 'enters_premises',
    waterlog_where: ['access_road', 'ground_floor'],
    waterlog_severity: 'severe',
    floor_level: 'ground',
  },
  {
    at: 'six-mile',
    note: 'Extra monthly maintenance',
    property_type: 'flat',
    bhk: 2,
    rent: 16000,
    gated: true,
    maintenance_incl: false,
    maintenance_amount: 1800,
  },
  {
    at: 'jalukbari',
    note: 'Top-floor room, no power backup',
    property_type: 'room',
    bhk: 0,
    rent: 3500,
    floor_level: 'upper',
    power_backup: 'none',
    power_cuts: 'daily',
  },
  {
    at: 'dispur',
    note: 'Furnished flat with parking',
    property_type: 'flat',
    bhk: 2,
    rent: 25000,
    furnishing: 'furnished',
    gated: true,
    parking_cars: 1,
    water_availability: '24h',
    power_backup: 'full',
  },
  {
    at: 'maligaon',
    note: 'Water and monsoon not reported yet',
    property_type: 'flat',
    bhk: 1,
    rent: 7000,
    water_availability: 'unknown',
  },
];

function anchorBySlugOrName(key: string): Anchor {
  return (
    ANCHORS.find((a) => a.slug === key || a.name.toLowerCase().replace(/\s+/g, '-') === key) ??
    ANCHORS[0]
  );
}

/** Random point within ~`meters` of an anchor, kept inside the Guwahati bbox, rounded like real pins. */
function jitter(rand: () => number, a: Anchor, meters: number): { lat: number; lng: number } {
  for (;;) {
    const r = meters * Math.sqrt(rand());
    const t = 2 * Math.PI * rand();
    const lat = round3(a.lat + (r * Math.cos(t)) / 111_000);
    const lng = round3(a.lng + (r * Math.sin(t)) / (111_000 * Math.cos((a.lat * Math.PI) / 180)));
    if (inGuwahati(lat, lng)) return { lat, lng };
  }
}

function pick<T>(rand: () => number, items: readonly T[], weights?: readonly number[]): T {
  const w = weights ?? items.map(() => 1);
  let x = rand() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < items.length; i++) if ((x -= w[i]) < 0) return items[i];
  return items[items.length - 1];
}

export function demoPins(scenario: Scenario): PublicPin[] {
  const total = SCENARIOS[scenario];
  const rand = mulberry32(total * 7919);
  const out: PublicPin[] = [];

  const make = (
    i: number,
    a: Anchor,
    at: { lat: number; lng: number },
    fields: Partial<PublicPin>,
  ): PublicPin => ({
    ...blank(),
    property_type: 'flat',
    bhk: 2,
    rent: 10000,
    ...fields,
    id: `${DEMO_PREFIX}${scenario}-${String(i).padStart(3, '0')}`,
    locality_slug: a.slug,
    created_at: new Date(BASE - Math.floor(rand() * 300) * 86_400_000).toISOString(),
    ...at,
  });

  SCENARIO_PINS.forEach(({ at, note, ...fields }, i) => {
    const a = anchorBySlugOrName(at);
    out.push(make(i, a, jitter(rand, a, 400), { ...fields, one_liner: `Demo scenario: ${note}` }));
  });

  const weights = ANCHORS.map((a) =>
    scenario === 'stress' && a.weight > 1 ? a.weight * 2 : a.weight,
  );
  for (let i = out.length; i < total; i++) {
    const a = pick(rand, ANCHORS, weights);
    // Dense/stress: some pins share a spot exactly (same building after 3dp rounding).
    const prev = out[out.length - 1];
    const stack = scenario !== 'normal' && rand() < 0.12 && prev;
    const at = stack
      ? { lat: prev.lat, lng: prev.lng }
      : jitter(rand, a, scenario === 'normal' ? 700 : 900);

    const type = pick(
      rand,
      ['flat', 'independent', '1rk', 'room', 'pg'] as const,
      [55, 10, 10, 12, 13],
    );
    const bhk = NO_BHK_TYPES.includes(type) ? 0 : pick(rand, [1, 2, 3, 4], [25, 45, 25, 5]);
    const band = rentBand(type, bhk);
    // Stay in the lower part of the plausibility band, like typical Guwahati rents.
    const rent = Math.round((band.min + (band.max - band.min) * 0.25 * rand() ** 1.5) / 500) * 500;
    const availability = pick(
      rand,
      ['24h', 'daily_fixed', 'daily_limited', 'alternate_day', 'irregular', 'unknown'] as const,
      [25, 30, 10, 8, 7, 20],
    );
    const scheduled = availability !== '24h' && availability !== 'unknown';
    const wl = pick(
      rand,
      ['none', 'road_only', 'enters_premises', 'unknown'] as const,
      [35, 25, 8, 32],
    );

    out.push(
      make(i, stack ? anchorBySlugOrName(prev.locality_slug ?? '') : a, at, {
        property_type: type,
        bhk,
        rent: Math.max(band.min, rent),
        furnishing: pick(rand, ['unfurnished', 'semi', 'furnished'] as const, [40, 40, 20]),
        gated: type === 'flat' && rand() < 0.4,
        parking_cars:
          type === 'flat' || type === 'independent' ? pick(rand, [0, 1, 2], [50, 40, 10]) : 0,
        deposit_months: rand() < 0.7 ? pick(rand, [1, 2, 3], [40, 45, 15]) : null,
        water_availability: availability,
        water_litres: scheduled && rand() < 0.4 ? pick(rand, [300, 500, 800, 1000, 1500]) : null,
        water_sources:
          rand() < 0.6
            ? [
                pick(
                  rand,
                  ['piped', 'borewell', 'well', 'tanker', 'shared_tank'] as const,
                  [40, 30, 10, 8, 12],
                ),
              ]
            : null,
        water_extra_cost: rand() < 0.3 ? pick(rand, ['none', 'tanker', 'charge'] as const) : null,
        waterlogging: wl,
        waterlog_where:
          wl === 'road_only'
            ? ['access_road']
            : wl === 'enters_premises'
              ? ['entrance', 'parking']
              : null,
        waterlog_severity:
          wl === 'road_only' || wl === 'enters_premises'
            ? pick(rand, ['minor', 'moderate', 'severe'] as const, [50, 35, 15])
            : null,
        power_backup: rand() < 0.5 ? pick(rand, ['full', 'partial', 'none'] as const) : null,
        one_liner: null,
      }),
    );
  }
  return out;
}
