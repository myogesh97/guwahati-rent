const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim());
export function corsHeaders(origin: string | null) {
  const o = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
