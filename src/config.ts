// Public, build-time config (SPEC §4). Everything here ends up in the browser bundle by design.
// Also imported outside Vite (vite.config.ts, node tests), where import.meta.env and location
// don't exist; those only use POLICY.
const env: Partial<ImportMetaEnv> = import.meta.env ?? {};
const origin = typeof location === 'undefined' ? '' : location.origin;

export const SUPABASE_URL: string = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY ?? '';
export const TURNSTILE_SITE_KEY: string = env.VITE_TURNSTILE_SITE_KEY ?? '';
export const TILES_URL: string = env.VITE_TILES_URL || '/tiles/guwahati.pmtiles';
export const SITE_URL: string = (env.VITE_SITE_URL || origin).replace(/\/$/, '');

/** True when the backend is wired up. Without it the map still works, read-only. */
export const BACKEND_READY = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** First view: about the middle of public/localities.json, so a phone at zoom 12 opens on the
 *  Dispur / GS Road / Zoo Road belt where most rents are, instead of the western edge. */
export const GUWAHATI_CENTER: [number, number] = [91.77, 26.15];

/**
 * Every number that appears in policy or copy (PHASE-2C §2c.1-G). HTML pages get them through
 * %POLICY.<key>% placeholders (src/html-vars.ts); TypeScript imports them. The server enforces
 * them; tests/policy.test.ts fails if this drifts from the server code, the migrations, or the
 * wording of privacy.html, terms.html and about.html.
 */
export const POLICY = {
  /** Rent pins: rounded server-side to 3 decimals (round3, _shared/rules.ts) ≈ 110 m. */
  pinDecimals: 3,
  pinRoundingM: 110,
  /** To-Let boards: 4 decimals (round4) ≈ 11 m; a board is public signage. */
  boardDecimals: 4,
  boardRoundingM: 11,
  /** Open reports that hide a pin (0006 bump_report_count) or a board (public_tolet). */
  reportThreshold: 3,
  /** To-Let boards expire this long after upload (TOLET_LIFETIME_DAYS, 0004 expires_at). */
  boardExpiryDays: 60,
  /** Medians use rents from this window only (0007, interval '18 months'). */
  statsWindowMonths: 18,
  /** No median from fewer rents than this (having count(*) >= 3). */
  minSample: 3,
  /** Report notes are deleted this long after the report is resolved (0006 cleanup). */
  reportNoteRetentionDays: 90,
  /** The live-counts strip stays hidden below this many rents (PHASE-2C §2c.1-E). */
  liveCountsMin: 50,
  /** A society name is public only when this many pins share it within societyRadiusM (0010). */
  societyMinPins: 3,
  societyRadiusM: 300,
  /** To-Let boards older than this get a "may be gone" badge (PHASE-2C §2c.2-D). */
  boardStaleDays: 45,
} as const;
