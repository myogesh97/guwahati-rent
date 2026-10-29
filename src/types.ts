import type { PropertyType } from '../supabase/functions/_shared/rules';

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
}

export interface Locality {
  slug: string;
  name: string;
  lat: number;
  lng: number;
}
