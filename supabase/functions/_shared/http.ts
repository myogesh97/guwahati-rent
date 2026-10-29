import { corsHeaders } from './cors.ts';

/** SPEC §7.1 step 6: `{ ok: true, ...data }` or `{ ok: false, error }`. Never leak stack traces. */
export function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}

export const ok = (req: Request, data: Record<string, unknown> = {}) => json(req, 200, { ok: true, ...data });
/** `extra` may carry non-sensitive hints such as `fields` (input names to highlight). Never values. */
export const fail = (req: Request, status: number, error: string, extra: Record<string, unknown> = {}) =>
  json(req, status, { ok: false, error, ...extra });

/** Handles CORS preflight and rejects anything that is not a POST. Returns null when the request may proceed. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req.headers.get('origin')) });
  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed.');
  return null;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
