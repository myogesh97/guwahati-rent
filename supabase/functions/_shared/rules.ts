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
