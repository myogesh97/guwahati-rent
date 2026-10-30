// ALL network calls live here (SPEC §8.4).
// Reads: public views via PostgREST. Writes: Edge Functions only (SPEC §5.2).
// Plain fetch instead of supabase-js keeps the map page bundle small; the admin page (Phase 4) can use supabase-js.
import { BACKEND_READY, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { PublicPin } from './types';

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
