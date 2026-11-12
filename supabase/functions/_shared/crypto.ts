export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]!));
}
/**
 * The caller's IP for rate limits and report de-duplication (SECURITY_AUDIT_REPORT.md M-2).
 * The first X-Forwarded-For entry is whatever the client sent, so headers that the platform's
 * proxy sets itself come first. Once `scripts/check-client-ip.sh` has shown which header the live
 * project really provides, set the CLIENT_IP_HEADER secret to it to use only that header.
 */
export function clientIp(req: Request): string {
  const get = (name: string) => (req.headers.get(name) ?? '').split(',')[0].trim();
  const pinned = Deno.env.get('CLIENT_IP_HEADER');
  if (pinned) return get(pinned) || 'unknown';
  return get('cf-connecting-ip') || get('x-real-ip') || get('x-forwarded-for') || 'unknown';
}

/** Salted hash of the caller's IP, or null when it isn't known (so unknowns never collide). */
export async function ipHash(req: Request): Promise<string | null> {
  const ip = clientIp(req);
  return ip === 'unknown' ? null : saltedHash(`ip:${ip}`);
}

/** Constant-time string comparison, so secrets and hashes can't be guessed by timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Rate-limit counter keys: sha256(ip + salt) and sha256(browserId + salt) (SPEC §7.1 step 4).
 * An `unknown` IP gets no IP key: hashing the literal 'unknown' would put every such caller in
 * ONE shared bucket, so a single user's 5/day would lock out everyone. The browser counter
 * still applies, and the caller logs that the IP was missing.
 */
export async function rateLimitKeys(ip: string, browserId: string): Promise<string[]> {
  const salt = Deno.env.get('HASH_SALT');
  if (!salt) throw new Error('HASH_SALT is not set');
  const keys = [await sha256(browserId + salt)];
  if (ip && ip !== 'unknown') keys.unshift(await sha256(ip + salt));
  return keys;
}

/** sha256(value + HASH_SALT): how browser ids are stored (uploader / reporter hashes). */
export async function saltedHash(value: string): Promise<string> {
  const salt = Deno.env.get('HASH_SALT');
  if (!salt) throw new Error('HASH_SALT is not set');
  return sha256(value + salt);
}
