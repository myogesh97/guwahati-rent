// Pure logic for the survey import (NEXT-PHASES §3). No I/O here, so tests/import-survey.test.ts
// can cover it. Used by scripts/import-survey.ts.
import { createHash } from 'node:crypto';
import { LOCALITIES } from '../supabase/functions/_shared/localities';
import {
  inGuwahati,
  rentProblem,
  round3,
  waterlogSummary,
  type PropertyType,
} from '../supabase/functions/_shared/rules';

/** Quoted-field-aware CSV parser (RFC 4180: quotes, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** Column headers as written in the Google Form (NEXT-PHASES §3.2). Matching is case-insensitive
 *  and ignores punctuation, so "Monthly rent in ₹" and "monthly rent in rs" both work. */
const COLUMNS = {
  timestamp: ['timestamp'],
  locality: ['area / locality', 'area locality', 'area', 'locality'],
  type: ['type of home', 'home type', 'type'],
  bhk: ['bedrooms', 'bhk'],
  rent: ['monthly rent in ₹', 'monthly rent in rs', 'monthly rent', 'rent'],
  furnishing: ['furnishing'],
  gated: ['gated society?', 'gated society', 'gated'],
  waterlog: [
    'does it waterlog in the monsoon?',
    'does it waterlog in the monsoon',
    'waterlogging',
    'monsoon',
  ],
  consent: ['consent', 'i agree'],
} as const;
type Col = keyof typeof COLUMNS;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}₹?/ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function mapHeaders(header: string[]): Record<Col, number> | { missing: Col[] } {
  const idx = {} as Record<Col, number>;
  const missing: Col[] = [];
  for (const col of Object.keys(COLUMNS) as Col[]) {
    const i = header.findIndex((h) => {
      const n = norm(h);
      return (COLUMNS[col] as readonly string[]).some(
        (c) => n === norm(c) || n.startsWith(norm(c)),
      );
    });
    if (i < 0) missing.push(col);
    else idx[col] = i;
  }
  return missing.length ? { missing } : idx;
}

const TYPE: Record<string, PropertyType> = {
  flat: 'flat',
  apartment: 'flat',
  house: 'independent',
  'independent house': 'independent',
  independent: 'independent',
  '1rk': '1rk',
  '1 rk': '1rk',
  studio: 'studio',
  room: 'room',
  pg: 'pg',
  'pg / hostel': 'pg',
};
const FURN: Record<string, 'furnished' | 'semi' | 'unfurnished'> = {
  unfurnished: 'unfurnished',
  semi: 'semi',
  'semi-furnished': 'semi',
  'semi furnished': 'semi',
  furnished: 'furnished',
  'fully furnished': 'furnished',
};
const WATER: Record<string, 'no' | 'yes' | 'unknown'> = {
  no: 'no',
  none: 'no',
  'road only': 'yes',
  'water comes in': 'yes',
  'not sure': 'unknown',
  unknown: 'unknown',
  '': 'unknown',
};

export interface SurveyPin {
  import_ref: string;
  source: 'survey';
  kind: 'rent';
  property_type: PropertyType;
  bhk: number;
  rent: number;
  furnishing: 'furnished' | 'semi' | 'unfurnished';
  gated: boolean;
  waterlogging: 'none' | 'road_only' | 'enters_premises' | 'unknown';
  waterlog_where: string[] | null;
  locality_slug: string;
  location_approx: true;
  lat: number;
  lng: number;
}

export type RowResult = { ok: true; pin: SurveyPin } | { ok: false; reason: string };

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Deterministic point within `maxM` metres of the locality centre, seeded from import_ref, so a
 * re-run places the same row at the same spot. Stored at 3 dp like every rent pin.
 */
export function jitter(ref: string, centre: { lat: number; lng: number }, maxM = 150) {
  const h = sha256(`jitter:${ref}`);
  const u1 = parseInt(h.slice(0, 8), 16) / 0x100000000;
  const u2 = parseInt(h.slice(8, 16), 16) / 0x100000000;
  const r = maxM * Math.sqrt(u1); // uniform over the disc, not clustered at the centre
  const a = 2 * Math.PI * u2;
  const dLat = (r * Math.cos(a)) / 111_320;
  const dLng = (r * Math.sin(a)) / (111_320 * Math.cos((centre.lat * Math.PI) / 180));
  return { lat: round3(centre.lat + dLat), lng: round3(centre.lng + dLng) };
}

export function mapRow(cells: string[], idx: Record<Col, number>): RowResult {
  const get = (c: Col) => (cells[idx[c]] ?? '').trim();
  const consent = norm(get('consent'));
  if (!/^(yes|i agree|agree|true|✓|checked)/.test(consent) && !consent.startsWith('i agree'))
    return { ok: false, reason: 'no consent' };

  const localityName = get('locality');
  const locality = LOCALITIES.find((l) => norm(l.name) === norm(localityName));
  if (!locality) return { ok: false, reason: `unknown locality "${localityName}"` };

  const property_type = TYPE[norm(get('type'))];
  if (!property_type) return { ok: false, reason: `unknown type "${get('type')}"` };

  const bhkRaw = norm(get('bhk'));
  let bhk: number;
  if (
    ['pg', '1rk', 'room', 'studio'].includes(property_type) ||
    /not applicable|^na$|^n a$/.test(bhkRaw)
  )
    bhk = 0;
  else {
    const n = parseInt(bhkRaw, 10);
    if (!Number.isFinite(n) || n < 1) return { ok: false, reason: `bedrooms "${get('bhk')}"` };
    bhk = Math.min(n, 5);
  }
  if (bhk === 0 && (property_type === 'flat' || property_type === 'independent'))
    return { ok: false, reason: 'flat/house without bedrooms' };

  const rent = Math.round(Number(get('rent').replace(/[₹,\s]/g, '')));
  const problem = rentProblem(property_type, bhk, rent);
  if (problem) return { ok: false, reason: 'implausible rent for this type of home' };

  const furnishing = FURN[norm(get('furnishing'))];
  if (!furnishing) return { ok: false, reason: `furnishing "${get('furnishing')}"` };

  const g = norm(get('gated'));
  if (g !== 'yes' && g !== 'no') return { ok: false, reason: `gated "${get('gated')}"` };

  const waterRaw = norm(get('waterlog'));
  const answer = WATER[waterRaw];
  if (answer === undefined) return { ok: false, reason: `waterlogging "${get('waterlog')}"` };
  const where =
    answer === 'yes' ? (waterRaw === 'road only' ? ['access_road'] : ['inside_home']) : null;
  const waterlogging = waterlogSummary(answer, where ?? undefined);

  // Same row => same ref, so re-importing the same CSV is a no-op (unique index on import_ref).
  const import_ref = sha256(cells.map((c) => c.trim()).join('\u001f'));
  const { lat, lng } = jitter(import_ref, locality);
  if (!inGuwahati(lat, lng)) return { ok: false, reason: 'outside bbox' };

  return {
    ok: true,
    pin: {
      import_ref,
      source: 'survey',
      kind: 'rent',
      property_type,
      bhk,
      rent,
      furnishing,
      gated: g === 'yes',
      waterlogging,
      waterlog_where: where,
      locality_slug: locality.slug,
      location_approx: true,
      lat,
      lng,
    },
  };
}

/** True for keys that must never be used here (publishable/anon keys), so the script refuses them. */
export function looksLikePublicKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      return payload.role !== 'service_role';
    } catch {
      return true;
    }
  }
  return !key.startsWith('sb_secret_');
}
