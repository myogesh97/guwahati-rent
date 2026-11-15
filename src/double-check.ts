// Rent double-check (NEXT-PHASES §4.2): a gentle "is this right?" when a rent is far above the
// area's median. Only where the area has enough rents of that kind to know.
import type { LocalityStat } from './types';

export const MIN_PINS = 5;
export const FACTOR = 2;

/** The median (and its sample size) when `rent` is more than 2× it for this area + BHK, else null. */
export function highRentMedian(
  rent: number,
  localitySlug: string | null,
  bhk: number,
  stats: LocalityStat[],
): { median: number; n: number } | null {
  if (!localitySlug) return null;
  const row = stats.find((s) => s.locality_slug === localitySlug && Number(s.bhk) === bhk);
  if (!row || Number(row.n) < MIN_PINS) return null;
  const median = Number(row.median_rent);
  return rent > FACTOR * median ? { median, n: Number(row.n) } : null;
}
