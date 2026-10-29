import { round3 } from './rules.ts';
export { BBOX, inGuwahati, round3 } from './rules.ts';

export const toWkt = (lat: number, lng: number) => `SRID=4326;POINT(${round3(lng)} ${round3(lat)})`;

// nearest locality within 3 km (localities copied from public/localities.json into _shared/localities.ts)
export function nearestLocality(lat: number, lng: number, list: { slug: string; lat: number; lng: number }[]) {
  let best: string | null = null,
    bestD = Infinity;
  for (const l of list) {
    const d = haversineM(lat, lng, l.lat, l.lng);
    if (d < bestD) {
      bestD = d;
      best = l.slug;
    }
  }
  return bestD <= 3000 ? best : null;
}

function haversineM(a: number, b: number, c: number, d: number) {
  const R = 6371000,
    toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(c - a),
    dLng = toR(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
