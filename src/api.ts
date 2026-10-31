// ALL network calls live here (SPEC §8.4).
// Reads: public views via PostgREST. Writes: Edge Functions only (SPEC §5.2).
// Plain fetch instead of supabase-js keeps the map page bundle small; the admin page (Phase 4) can use supabase-js.
import { BACKEND_READY, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { AreaStat, CityStat, LocalityStat, PublicBoard, PublicPin } from './types';
import type { ToletExt } from '../supabase/functions/_shared/rules';

/**
 * Only the `apikey` header: it works with both legacy anon JWTs and new `sb_publishable_` keys.
 * A publishable key must not be sent as a Bearer token.
 */
function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: SUPABASE_ANON_KEY, ...extra };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Form field names the server flagged (never their values). */
    readonly fields: string[] = [],
  ) {
    super(message);
  }
}

// The map loads every pin once (SPEC §8.4), so it asks only for what the map and the
// same-spot picker show. These columns all exist since 0001, so this works before and after
// later migrations. Everything else (water, monsoon, deposit...) is fetched when a pin is opened.
const MAP_COLUMNS =
  'id,kind,property_type,bhk,rent,furnishing,gated,waterlogging,locality_slug,is_outlier,created_at,lat,lng';

/** Pins that so far only have MAP_COLUMNS. The pin card fills them in with fetchPinDetails. */
export const leanPins = new WeakSet<PublicPin>();

export async function fetchPins(): Promise<PublicPin[]> {
  if (!BACKEND_READY) return [];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/public_pins?select=${MAP_COLUMNS}&order=created_at.desc`,
    { headers: headers() },
  );
  if (!res.ok) throw new ApiError('Could not load pins.', res.status);
  const pins = (await res.json()) as PublicPin[];
  for (const p of pins) leanPins.add(p);
  return pins;
}

/** Every public column for one pin. `select=*` because public_pins is the security boundary. */
export async function fetchPinDetails(id: string): Promise<PublicPin> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/public_pins?select=*&id=eq.${encodeURIComponent(id)}`,
    { headers: headers() },
  );
  if (!res.ok) throw new ApiError('Could not load this pin.', res.status);
  const [row] = (await res.json()) as PublicPin[];
  if (!row) throw new ApiError('This pin is no longer on the map.', 404);
  return row;
}

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  if (!BACKEND_READY) throw new ApiError('The site is in read-only mode right now.', 503);
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  } catch {
    if (navigator.onLine) {
      // Usually CORS: this site's origin is missing from the function's ALLOWED_ORIGINS secret.
      console.warn(`Could not reach ${name}. If you run this site, check ALLOWED_ORIGINS.`);
    }
    throw new ApiError(
      navigator.onLine
        ? 'Could not reach the server. Please try again in a minute.'
        : 'You seem to be offline. Check your connection and try again.',
      0,
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new ApiError(
      data?.error ?? 'Something went wrong. Please try again.',
      res.status,
      Array.isArray(data?.fields) ? data.fields.filter((f: unknown) => typeof f === 'string') : [],
    );
  }
  return data as T;
}

export interface SubmitPinResult {
  id: string;
  editToken: string;
  pin: PublicPin;
}

export const submitPin = (body: Record<string, unknown>) =>
  callFunction<SubmitPinResult>('submit-pin', body);

export const deletePin = (id: string, editToken: string, browserId: string) =>
  callFunction<{ ok: true }>('edit-pin', { id, editToken, action: 'delete', browserId });

/** Same answers and validation as submitPin; the location stays as pinned (NEXT-PHASES §4.7). */
export const updatePin = (
  id: string,
  editToken: string,
  browserId: string,
  body: Record<string, unknown>,
) =>
  callFunction<{ pin: PublicPin | null }>('edit-pin', {
    ...body,
    id,
    editToken,
    browserId,
    action: 'update',
  });

export type ReportReason =
  'fake_rent' | 'broker' | 'wrong_location' | 'rented_out' | 'offensive' | 'other';

export const reportPin = (body: {
  pinId: string;
  reason: ReportReason;
  message?: string;
  browserId: string;
  turnstileToken: string;
}) => callFunction<{ already: boolean }>('report-pin', body);

// ---------- Stats (medians only; the views drop buckets under 3 pins) ----------

async function readView<T>(path: string, what: string): Promise<T> {
  if (!BACKEND_READY) throw new ApiError('Stats need the database, which is not connected.', 503);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) throw new ApiError(`Could not load ${what}.`, res.status);
  return (await res.json()) as T;
}

export const fetchCityStats = () =>
  readView<CityStat[]>('public_stats_city?select=*', 'city medians');

let localityStats: Promise<LocalityStat[]> | null = null;
/** Cached for the session (also used by the rent double-check). */
export function fetchLocalityStats(): Promise<LocalityStat[]> {
  localityStats ??= readView<LocalityStat[]>(
    'public_stats_locality?select=*',
    'area medians',
  ).catch((e) => {
    localityStats = null;
    throw e;
  });
  return localityStats;
}

export async function fetchAreaStats(b: {
  west: number;
  south: number;
  east: number;
  north: number;
}): Promise<AreaStat[]> {
  if (!BACKEND_READY) throw new ApiError('Stats need the database, which is not connected.', 503);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/area_stats`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ min_lng: b.west, min_lat: b.south, max_lng: b.east, max_lat: b.north }),
  });
  if (!res.ok) throw new ApiError('Could not load stats for this area.', res.status);
  return (await res.json()) as AreaStat[];
}

// ---------- To-Let boards (NEXT-PHASES §2a) ----------

/** Approved, unexpired boards. Before migration 0004 the view has other columns: show none. */
export async function fetchBoards(): Promise<PublicBoard[]> {
  if (!BACKEND_READY) return [];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/public_tolet?select=id,public_photo_path,public_thumb_path,created_at,expires_at,lat,lng`,
    { headers: headers() },
  );
  if (!res.ok) throw new ApiError('Could not load To-Let boards.', res.status);
  return (await res.json()) as PublicBoard[];
}

/** Approved photos live in the public bucket; the path comes from public_tolet. */
export const boardImageUrl = (path: string): string =>
  `${SUPABASE_URL}/storage/v1/object/public/tolet-public/${path.split('/').map(encodeURIComponent).join('/')}`;

export interface ToletUpload {
  boardId: string;
  lat: number;
  lng: number;
  uploads: { full: string; thumb: string };
}

export const requestToletUpload = (body: {
  turnstileToken: string;
  browserId: string;
  lat: number;
  lng: number;
  ext: ToletExt;
}) => callFunction<ToletUpload>('tolet-upload-url', body);

/**
 * PUT to a signed upload URL from `createSignedUploadUrl` (Storage `PUT /object/upload/sign/
 * <bucket>/<path>?token=…`). The token in the URL is the authorisation; raw body + content-type
 * is the same request storage-js 2.x `uploadToSignedUrl` sends for non-Blob bodies.
 */
export async function uploadToSignedUrl(url: string, blob: Blob): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': blob.type, 'x-upsert': 'false' },
    });
  } catch {
    throw new ApiError('The upload was interrupted. Check your connection and try again.', 0);
  }
  if (!res.ok) {
    throw new ApiError(
      res.status === 413
        ? 'This photo is too large to upload. Please take it again.'
        : 'The photo could not be uploaded. Please try again.',
      res.status,
    );
  }
}

export const submitTolet = (boardId: string, browserId: string) =>
  callFunction<{ boardId: string }>('submit-tolet', { boardId, browserId });

export const reportTolet = (boardId: string, browserId: string, turnstileToken: string) =>
  callFunction<{ ok: true }>('report-tolet', { boardId, browserId, turnstileToken });
