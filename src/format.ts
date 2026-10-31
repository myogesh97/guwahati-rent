import type { PublicPin } from './types';

export const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Short label for map pins: ₹8.5k, ₹14k, ₹1.2L */
export function shortRupees(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  if (n >= 1000) {
    const k = n / 1000;
    // One decimal so ₹10,500 reads ₹10.5k, not ₹11k; whole thousands stay short (₹14k).
    const r = Math.round(k * 10) / 10;
    return `₹${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)}k`;
  }
  return `₹${n}`;
}

const TYPE_LABEL: Record<PublicPin['property_type'], string> = {
  flat: 'Flat',
  independent: 'Independent house',
  pg: 'PG',
  '1rk': '1RK',
  room: 'Room',
  studio: 'Studio',
};

export function homeLabel(p: Pick<PublicPin, 'property_type' | 'bhk'>): string {
  if (p.bhk && p.bhk > 0) {
    const bhk = p.bhk >= 5 ? '5+ BHK' : `${p.bhk} BHK`;
    return p.property_type === 'flat'
      ? `${bhk} flat`
      : `${bhk} ${TYPE_LABEL[p.property_type].toLowerCase()}`;
  }
  return TYPE_LABEL[p.property_type];
}

export const FURNISHING_LABEL: Record<PublicPin['furnishing'], string> = {
  furnished: 'Furnished',
  semi: 'Semi-furnished',
  unfurnished: 'Unfurnished',
};

export const WATERLOG_LABEL: Record<PublicPin['waterlogging'], string> = {
  none: 'No waterlogging',
  road_only: 'Road waterlogs in monsoon',
  enters_premises: 'Water enters the premises in monsoon',
  unknown: 'Not reported',
};

export const WATER_LABEL: Record<NonNullable<PublicPin['water_supply']>, string> = {
  '24x7': '24×7',
  timed: 'Fixed hours',
  tanker: 'Tanker',
  unknown: 'Not sure',
};

export const POWER_LABEL: Record<NonNullable<PublicPin['power_backup']>, string> = {
  full: 'Full backup',
  partial: 'Partial backup',
  none: 'No backup',
  unknown: 'Not sure',
};

export function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/** Time left on something that expires (NEXT-PHASES §1b), e.g. "Expires in 12 days". */
export function expiresIn(iso: string, now = Date.now()): string {
  const days = Math.ceil((new Date(iso).getTime() - now) / 86400000);
  if (days <= 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

// ---------- living conditions (migration 0003) ----------
type Req<K extends keyof PublicPin> = NonNullable<PublicPin[K]>;
type Elem<T> = T extends readonly (infer E)[] ? E : never;

export const WATER_AVAILABILITY_LABEL: Record<Req<'water_availability'>, string> = {
  '24h': '24 hours',
  daily_fixed: 'Daily, fixed hours',
  daily_limited: 'Daily, but limited',
  alternate_day: 'Every other day',
  irregular: 'Irregular',
  unknown: 'Not sure',
};

export const WATER_SOURCE_LABEL: Record<Elem<Req<'water_sources'>>, string> = {
  piped: 'Piped supply',
  borewell: 'Borewell',
  well: 'Well',
  tanker: 'Tanker',
  shared_tank: 'Shared building tank',
  other: 'Other',
};

export const WATER_EXTRA_LABEL: Record<Req<'water_extra_cost'>, string> = {
  none: 'No extra cost',
  tanker: 'Buys tanker water',
  charge: 'Pays a monthly water charge',
  both: 'Buys tanker water and pays a water charge',
};

export const DRINKING_LABEL: Record<Req<'drinking_water'>, string> = {
  supplied: 'Comes with the supply',
  purifier: 'Purifier at home',
  buy_cans: 'Buys water cans',
  boil_filter: 'Boils or filters',
  other: 'Other',
};

export const WATERLOG_PLACE_LABEL: Record<Elem<Req<'waterlog_where'>>, string> = {
  access_road: 'road to the home',
  neighbourhood: 'wider area nearby',
  entrance: 'gate or entrance',
  parking: 'parking',
  ground_floor: 'ground-floor rooms',
  inside_home: 'inside the home',
};

export const SEVERITY_LABEL: Record<Req<'waterlog_severity'>, string> = {
  minor: 'ankle-deep or less',
  moderate: 'up to the knee',
  severe: 'above the knee',
};

export const DURATION_LABEL: Record<Req<'waterlog_duration'>, string> = {
  under_3h: 'clears in under 3 hours',
  '3_to_12h': 'stays 3 to 12 hours',
  '12_to_48h': 'stays 12 to 48 hours',
  over_48h: 'stays more than 2 days',
};

export const ROAD_LABEL: Record<Req<'road_in_rain'>, string> = {
  usable: 'Road stays usable',
  difficult: 'Getting in and out is difficult',
  cut_off: 'Cut off for a while',
};

export const FLOOR_LABEL: Record<Req<'floor_level'>, string> = {
  ground: 'Ground floor',
  upper: 'Upper floor',
  whole_house: 'Whole house',
};

export const POWER_CUTS_LABEL: Record<Req<'power_cuts'>, string> = {
  rare: 'Rare',
  weekly: 'About once a week',
  daily: 'Daily',
  several_daily: 'Several times a day',
};

export const litres = (n: number): string => `${n.toLocaleString('en-IN')} L`;
