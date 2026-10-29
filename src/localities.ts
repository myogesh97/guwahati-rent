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
