// Explicit consent (PHASE-2C §2c.2-C): every public form sends `consent: true` from a box the
// person ticked. Checked before anything else (cheap, and before Turnstile or the rate limit).
import { fail } from './http.ts';

export const CONSENT_MESSAGE = 'Please tick the box to agree to the Privacy Policy and Terms.';

/** True only for a literal `consent: true` (not "true", 1 or a missing field). */
export const hasConsent = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && (body as Record<string, unknown>).consent === true;

/** 400 `{ ok: false, error, field: 'consent', fields: ['consent'] }` without consent, else null. */
export const requireConsent = (req: Request, body: unknown): Response | null =>
  hasConsent(body)
    ? null
    : fail(req, 400, CONSENT_MESSAGE, { field: 'consent', fields: ['consent'] });
