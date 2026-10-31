import type { Locality } from './types';

let cache: Promise<Locality[]> | null = null;

export function loadLocalities(): Promise<Locality[]> {
  cache ??= fetch('/localities.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return cache;
}

export async function localityName(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const list = await loadLocalities();
  return list.find((l) => l.slug === slug)?.name ?? null;
}

/** Nearest listed locality within 3 km, same rule as submit-pin's nearestLocality(). */
export async function nearestLocality(lat: number, lng: number): Promise<Locality | null> {
  const list = await loadLocalities();
  let best: Locality | null = null;
  let bestD = Infinity;
  for (const l of list) {
    const d = (l.lat - lat) ** 2 + ((l.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return Math.sqrt(bestD) * 111_000 <= 3000 ? best : null;
}
