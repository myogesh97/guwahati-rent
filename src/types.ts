import type {
  DRINKING_WATER,
  FLOOR_LEVEL,
  POWER_CUTS,
  PropertyType,
  ROAD_IN_RAIN,
  WATER_AVAILABILITY,
  WATER_EXTRA_COST,
  WATER_SOURCES,
  WATERLOG_DURATION,
  WATERLOG_PLACES,
  WATERLOG_SEVERITY,
} from '../supabase/functions/_shared/rules';

type Of<T extends readonly string[]> = T[number];

/** Mirrors the public_pins view (SPEC §6.1). Never contains contacts or edit hashes. */
export interface PublicPin {
  id: string;
  kind: 'rent' | 'listing_whole' | 'listing_room';
  property_type: PropertyType;
  bhk: number | null;
  rent: number;
  furnishing: 'furnished' | 'semi' | 'unfurnished';
  gated: boolean;
  maintenance_incl: boolean | null;
  deposit_months: number | null;
  sqft: number | null;
  parking_cars: number;
  society_name: string | null;
  occupants: 'family' | 'bachelor' | null;
  pets_allowed: 'yes' | 'no' | 'any' | null;
  waterlogging: 'none' | 'road_only' | 'enters_premises' | 'unknown';
  water_supply: '24x7' | 'timed' | 'tanker' | 'unknown' | null;
  power_backup: 'full' | 'partial' | 'none' | 'unknown' | null;
  pg_meals: boolean | null;
  pg_gender: 'boys' | 'girls' | 'mixed' | null;
  one_liner: string | null;
  locality_slug: string | null;
  is_outlier: boolean;
  created_at: string;
  lat: number;
  lng: number;
  // Living conditions (migration 0003). Optional: absent on old rows / before the migration.
  water_sources?: Of<typeof WATER_SOURCES>[] | null;
  water_availability?: Of<typeof WATER_AVAILABILITY> | null;
  water_litres?: number | null;
  water_hours?: string | null;
  water_extra_cost?: Of<typeof WATER_EXTRA_COST> | null;
  water_shared?: boolean | null;
  drinking_water?: Of<typeof DRINKING_WATER> | null;
  water_note?: string | null;
  waterlog_where?: Of<typeof WATERLOG_PLACES>[] | null;
  waterlog_severity?: Of<typeof WATERLOG_SEVERITY> | null;
  waterlog_duration?: Of<typeof WATERLOG_DURATION> | null;
  road_in_rain?: Of<typeof ROAD_IN_RAIN> | null;
  floor_level?: Of<typeof FLOOR_LEVEL> | null;
  waterlog_note?: string | null;
  power_cuts?: Of<typeof POWER_CUTS> | null;
  maintenance_amount?: number | null;
  conditions_as_of?: string | null;
  // Migration 0004 (survey imports, Phase 2b).
  source?: 'user' | 'survey';
  location_approx?: boolean;
}

/** public_stats_city (medians only, 3+ pins, last 18 months since migration 0007). */
export interface CityStat {
  bhk: number;
  property_type: PublicPin['property_type'];
  gated: boolean;
  n: number;
  median_rent: number;
}

/** public_stats_locality. */
export interface LocalityStat {
  locality_slug: string;
  bhk: number;
  n: number;
  median_rent: number;
  pct_waterlog_severe: number | null;
  last_pin_at: string;
}

/** area_stats() for the current map bounds. */
export interface AreaStat {
  bhk: number;
  n: number;
  median_rent: number;
}

export interface Locality {
  slug: string;
  name: string;
  lat: number;
  lng: number;
}

/** Mirrors the public_tolet view (migration 0004): approved, unexpired boards only. */
export interface PublicBoard {
  id: string;
  public_photo_path: string | null;
  public_thumb_path: string | null;
  created_at: string;
  expires_at: string;
  lat: number;
  lng: number;
}
