import { admin } from './supabase.ts';
import { rateLimitKeys } from './crypto.ts';

// SPEC §7.1 step 4: hit_rate_limit(sha256(ip + HASH_SALT), ...) AND the same for the browser id.
// Both counters are always incremented; the request is allowed only if both are within the limit.
// Without a known client IP only the browser counter applies (see rateLimitKeys).
export async function withinRateLimit(
  action: string,
  ip: string,
  browserId: string,
  limit: number,
  window = '1 day',
): Promise<boolean> {
  const keys = await rateLimitKeys(ip, browserId);
  // Never log the IP itself. If this shows up in the function logs, set CLIENT_IP_HEADER.
  if (keys.length === 1) console.warn(`rate-limit: client IP unknown for ${action}; browser counter only`);
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
