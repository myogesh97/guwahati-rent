// DEV-ONLY demo dataset for testing the map at different densities.
// Every record is FICTIONAL. Nothing here is written to any database (SPEC §5.13: never invent
// seed data), and this module is only reachable behind `import.meta.env.DEV`, so it is not in
// production builds. Same scenario => same records and coordinates on every run.
import localities from '../../public/localities.json';
import {
  inGuwahati,
  pruneConditions,
  rentBand,
  round3,
  waterlogSummary,
  NO_BHK_TYPES,
  WATER_SCHEDULED,
} from '../../supabase/functions/_shared/rules';
import type { PublicPin } from '../types';
import { EXTRA_ANCHORS } from './anchors';

export const DEMO_PREFIX = 'demo-';
export const isDemoId = (id: string): boolean => id.startsWith(DEMO_PREFIX);

export const SCENARIOS = {
  normal: 25,
  dense: 80,
  stress: 260,
  crowded: 1000,
  packed: 5000,
  max: 20000, // SPEC §8.4: "load all pins once" is meant to hold up to ~20k rows
  full: 500, // every pin is a complete, rule-following form submission (see formPin)
} as const;

/** How each scenario places pins: spread (m), share of pins stacked on the previous spot,
 *  and how much extra weight the busy central areas get. */
const PROFILE: Record<keyof typeof SCENARIOS, { radius: number; stack: number; central: number }> =
  {
    normal: { radius: 700, stack: 0, central: 1 },
    dense: { radius: 900, stack: 0.12, central: 1 },
    stress: { radius: 900, stack: 0.12, central: 2 },
    crowded: { radius: 700, stack: 0.2, central: 3 },
    packed: { radius: 600, stack: 0.25, central: 4 },
    max: { radius: 600, stack: 0.25, central: 4 },
    full: { radius: 800, stack: 0.08, central: 2 },
  };
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

// ---------------------------------------------------------------------------
// "full" scenario: each pin is generated as what the rent form would SEND (same fields, same
// options, same conditional rules), then stored the way submit-pin stores it (pruneConditions +
// waterlogSummary). So every record is something the real form + server could produce.
// tests/demo-data.test.ts checks every pin against the shared rules and that every option appears.
// ---------------------------------------------------------------------------

const HOURS = [
  '6–8 am',
  '5–7 am',
  '6–7 pm',
  '6–8 am and 6–7 pm',
  'Morning, about 1 hour',
  'Evenings only',
];
const WATER_NOTES = [
  'Pressure is low on the top floor',
  'Supply stops for a day or two in winter',
  'Tank on the roof fills overnight',
  'Water has iron, needs a filter',
  'Landlord calls the tanker when supply fails',
];
const MONSOON_NOTES = [
  'Clears within an hour once the drain is cleaned',
  'Only during the heaviest July rains',
  'Lane floods, main road stays clear',
  'Parking floods, ground floor stays dry',
];
const ONE_LINERS = [
  'Quiet lane, short walk to the main road',
  'Close to a market and bus stop',
  'Good light, gets warm in summer',
  'Landlord lives downstairs',
  'Narrow approach road, two-wheeler friendly',
  'Near schools, busy in the mornings',
];

/** Uniform-ish whole number in [min, max], rounded to `step`. */
const between = (rand: () => number, min: number, max: number, step = 1) =>
  Math.min(max, Math.round((min + (max - min) * rand()) / step) * step);
const maybe = <T>(rand: () => number, p: number, v: () => T): T | undefined =>
  rand() < p ? v() : undefined;

/** What the form would submit for one fictional home. Only fields the form actually has. */
function formPin(rand: () => number, i: number) {
  const type = pick(
    rand,
    ['flat', 'independent', '1rk', 'room', 'pg'] as const,
    [50, 14, 11, 12, 13],
  );
  const bhk = NO_BHK_TYPES.includes(type) ? 0 : pick(rand, [1, 2, 3, 4, 5], [22, 42, 26, 7, 3]);
  const band = rentBand(type, bhk);
  const rent = Math.max(
    band.min,
    between(rand, band.min, band.min + (band.max - band.min) * 0.35, 500),
  );
  const sqftRange: Record<string, [number, number]> = {
    pg: [80, 150],
    room: [100, 220],
    '1rk': [200, 380],
    1: [450, 700],
    2: [750, 1150],
    3: [1100, 1650],
    4: [1500, 2400],
    5: [2000, 3500],
  };
  const [smin, smax] = sqftRange[NO_BHK_TYPES.includes(type) ? type : bhk];
  const availability = maybe(rand, 0.85, () =>
    pick(
      rand,
      ['24h', 'daily_fixed', 'daily_limited', 'alternate_day', 'irregular', 'unknown'] as const,
      [24, 30, 12, 12, 8, 14],
    ),
  );
  const litresRange: Record<string, [number, number]> = {
    daily_fixed: [300, 2000],
    daily_limited: [100, 600],
    alternate_day: [300, 1000],
    irregular: [200, 1000],
  };
  const scheduled = availability !== undefined && WATER_SCHEDULED.includes(availability);
  const answer = pick(rand, ['no', 'yes', 'unknown'] as const, [40, 30, 30]);
  const where =
    answer === 'yes'
      ? [
          ...new Set(
            Array.from({ length: between(rand, 1, 3) }, () =>
              pick(
                rand,
                [
                  'access_road',
                  'neighbourhood',
                  'entrance',
                  'parking',
                  'ground_floor',
                  'inside_home',
                ] as const,
                [40, 15, 15, 14, 10, 6],
              ),
            ),
          ),
        ]
      : undefined;
  const maintIncl = maybe(rand, 0.6, () => rand() < 0.45);
  return {
    property_type: type,
    bhk,
    rent,
    furnishing: pick(rand, ['unfurnished', 'semi', 'furnished'] as const, [38, 42, 20]),
    gated: (type === 'flat' ? 0.45 : 0.1) > rand(),
    parking_cars:
      type === 'flat' || type === 'independent' ? pick(rand, [0, 1, 2, 3], [42, 42, 13, 3]) : 0,
    society_name: maybe(
      rand,
      type === 'flat' ? 0.4 : 0.05,
      () => `Demo Apartments ${(i % 60) + 1}`,
    ),
    deposit_months: maybe(rand, 0.75, () => pick(rand, [0, 1, 2, 3, 6, 10], [6, 38, 38, 12, 5, 1])),
    sqft: maybe(rand, 0.55, () => between(rand, smin, smax, 10)),
    occupants: maybe(rand, 0.6, () => pick(rand, ['family', 'bachelor'] as const)),
    maintenance_incl: maintIncl,
    maintenance_amount: maybe(rand, 0.7, () => between(rand, 300, 3000, 100)),
    power_backup: maybe(rand, 0.65, () =>
      pick(rand, ['full', 'partial', 'none', 'unknown'] as const, [25, 30, 35, 10]),
    ),
    power_cuts: maybe(rand, 0.55, () =>
      pick(rand, ['rare', 'weekly', 'daily', 'several_daily'] as const, [35, 30, 25, 10]),
    ),
    pg_meals: type === 'pg' ? maybe(rand, 0.85, () => rand() < 0.7) : undefined,
    pg_gender:
      type === 'pg'
        ? maybe(rand, 0.9, () => pick(rand, ['boys', 'girls', 'mixed'] as const, [45, 40, 15]))
        : undefined,
    one_liner: maybe(rand, 0.3, () => pick(rand, ONE_LINERS)),
    water_availability: availability,
    water_litres: scheduled
      ? maybe(rand, 0.55, () =>
          availability === 'alternate_day' && rand() < 0.4
            ? 500
            : between(rand, ...litresRange[availability!], 50),
        )
      : undefined,
    water_hours: scheduled ? maybe(rand, 0.6, () => pick(rand, HOURS)) : undefined,
    water_extra_cost: maybe(rand, 0.55, () =>
      pick(rand, ['none', 'tanker', 'charge', 'both'] as const, [55, 20, 18, 7]),
    ),
    water_shared: maybe(rand, 0.5, () => rand() < 0.45),
    drinking_water: maybe(rand, 0.6, () =>
      pick(
        rand,
        ['supplied', 'purifier', 'buy_cans', 'boil_filter', 'other'] as const,
        [20, 35, 25, 17, 3],
      ),
    ),
    water_note: maybe(rand, 0.12, () => pick(rand, WATER_NOTES)),
    waterlog_answer: answer,
    waterlog_where: where,
    waterlog_severity: maybe(rand, 0.75, () =>
      pick(rand, ['minor', 'moderate', 'severe'] as const, [50, 35, 15]),
    ),
    waterlog_duration: maybe(rand, 0.6, () =>
      pick(rand, ['under_3h', '3_to_12h', '12_to_48h', 'over_48h'] as const, [45, 30, 18, 7]),
    ),
    road_in_rain: maybe(rand, 0.6, () =>
      pick(rand, ['usable', 'difficult', 'cut_off'] as const, [45, 40, 15]),
    ),
    floor_level: maybe(rand, 0.65, () =>
      type === 'independent'
        ? pick(rand, ['whole_house', 'ground'] as const, [80, 20])
        : pick(rand, ['ground', 'upper'] as const, [35, 65]),
    ),
    waterlog_note: maybe(rand, answer === 'yes' ? 0.3 : 0.03, () => pick(rand, MONSOON_NOTES)),
    conditions_as_of: maybe(rand, 0.3, () =>
      new Date(BASE - between(rand, 0, 200) * 86_400_000).toISOString().slice(0, 10),
    ),
  };
}

/** Store a form submission the way submit-pin does (drop non-applicable answers, derive summary). */
function storeLikeServer(sub: ReturnType<typeof formPin>): Partial<PublicPin> {
  const { waterlog_answer, ...rest } = pruneConditions(sub);
  const stored: Record<string, unknown> = {
    ...rest,
    waterlogging: waterlogSummary(waterlog_answer, rest.waterlog_where),
  };
  if (sub.property_type !== 'pg') {
    stored.pg_meals = undefined;
    stored.pg_gender = undefined;
  }
  for (const k of Object.keys(stored)) if (stored[k] === undefined) stored[k] = null;
  return stored as Partial<PublicPin>;
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
    id: `${DEMO_PREFIX}${scenario}-${String(i).padStart(5, '0')}`,
    locality_slug: a.slug,
    created_at: new Date(BASE - Math.floor(rand() * 300) * 86_400_000).toISOString(),
    ...at,
  });

  SCENARIO_PINS.forEach(({ at, note, ...fields }, i) => {
    const a = anchorBySlugOrName(at);
    // "full" mirrors the current form, which no longer asks for the water source.
    const f = scenario === 'full' ? { ...fields, water_sources: null } : fields;
    out.push(make(i, a, jitter(rand, a, 400), { ...f, one_liner: `Demo scenario: ${note}` }));
  });

  const profile = PROFILE[scenario];
  const weights = ANCHORS.map((a) => (a.weight > 1 ? a.weight * profile.central : a.weight));
  for (let i = out.length; i < total; i++) {
    const a = pick(rand, ANCHORS, weights);
    // Crowded scenarios: some pins share a spot exactly (same building after 3dp rounding).
    const prev = out[out.length - 1];
    const stack = rand() < profile.stack && prev;
    const at = stack ? { lat: prev.lat, lng: prev.lng } : jitter(rand, a, profile.radius);

    if (scenario === 'full') {
      out.push(
        make(
          i,
          stack ? anchorBySlugOrName(prev.locality_slug ?? '') : a,
          at,
          storeLikeServer(formPin(rand, i)),
        ),
      );
      continue;
    }
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
