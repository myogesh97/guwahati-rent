// To-Let board storage layout (NEXT-PHASES §2a.2). Every storage call for boards goes through
// here, so moving `tolet-public` to R2 later is a change in one file.
import { admin } from './supabase.ts';
import type { ToletExt } from './rules.ts';

export const PRIVATE_BUCKET = 'tolet';
export const PUBLIC_BUCKET = 'tolet-public';

/** Paths are relative to their bucket: tolet/pending/<id>/full.webp -> tolet-public/<id>/full.webp */
export const pendingPaths = (id: string, ext: ToletExt) => ({
  full: `pending/${id}/full.${ext}`,
  thumb: `pending/${id}/thumb.${ext}`,
});
export const publicPath = (id: string, privatePath: string) =>
  `${id}/${privatePath.split('/').pop()}`;

/** Removes objects, ignoring nulls. Throws on a storage error so callers keep the row for a retry. */
export async function removeFiles(bucket: string, paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => Boolean(p));
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await admin.storage.from(bucket).remove(list.slice(i, i + 500));
    if (error) throw error;
  }
}

/** Point from PostgREST's geography column: hex EWKB (SRID 4326), or GeoJSON on some setups. */
export function pointFromEwkb(hex: unknown): { lat: number; lng: number } | null {
  const geo = hex as { type?: string; coordinates?: [number, number] } | null;
  if (geo && typeof geo === 'object' && geo.type === 'Point' && geo.coordinates) {
    return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
  }
  // 01 | 01000020 (Point + SRID flag) | E6100000 (4326) | x float64 LE | y float64 LE
  if (typeof hex !== 'string' || hex.length !== 50) return null;
  const bytes = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  const view = new DataView(bytes.buffer);
  const le = bytes[0] === 1;
  return { lng: view.getFloat64(9, le), lat: view.getFloat64(17, le) };
}
