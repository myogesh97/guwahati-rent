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
  return data.success === true;
}
