import { admin } from './supabase.ts';
import { sha256 } from './crypto.ts';

// SPEC §7.1 step 4: hit_rate_limit(sha256(ip + HASH_SALT), ...) AND the same for the browser id.
// Both counters are always incremented; the request is allowed only if both are within the limit.
export async function withinRateLimit(
  action: string,
  ip: string,
  browserId: string,
  limit: number,
  window = '1 day',
): Promise<boolean> {
  const salt = Deno.env.get('HASH_SALT');
  if (!salt) throw new Error('HASH_SALT is not set');
  const keys = [await sha256(ip + salt), await sha256(browserId + salt)];
  const results = await Promise.all(
    keys.map((key) =>
      admin.rpc('hit_rate_limit', { p_key: key, p_action: action, p_limit: limit, p_window: window }),
    ),
  );
  for (const { data, error } of results) {
    if (error) throw error;
    if (data !== true) return false;
  }
  return true;
}
