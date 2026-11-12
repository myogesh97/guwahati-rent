// Hostnames a token may come from: the hosts in ALLOWED_ORIGINS (SECURITY_AUDIT_REPORT.md L-4).
// Empty list (ALLOWED_ORIGINS unset) = no hostname check, as before.
const allowedHosts = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => {
    try {
      return new URL(o.trim()).hostname;
    } catch {
      return '';
    }
  })
  .filter(Boolean);

/** The `action` every widget on the site renders with (src/ui/turnstile.ts). */
export const TURNSTILE_ACTION = 'submit';

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY is not set');
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip && ip !== 'unknown') body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!res.ok) return false;
  const data = await res.json();
  if (data.success !== true) return false;
  // A token solved on some other site that uses our site key (or a lifted widget) is refused.
  if (allowedHosts.length && !allowedHosts.includes(String(data.hostname ?? ''))) {
    console.warn('turnstile: token from an unexpected hostname');
    return false;
  }
  // A token from a widget rendered with another action (e.g. a different form or site) is refused.
  // Empty or missing (Cloudflare's test keys) is allowed; the hostname check above still applies.
  if (data.action && data.action !== TURNSTILE_ACTION) {
    console.warn('turnstile: token for an unexpected action');
    return false;
  }
  return true;
}
