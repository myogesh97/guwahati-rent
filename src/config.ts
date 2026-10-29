// Public, build-time config (SPEC §4). Everything here ends up in the browser bundle by design.
const env = import.meta.env;

export const SUPABASE_URL: string = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY ?? '';
export const TURNSTILE_SITE_KEY: string = env.VITE_TURNSTILE_SITE_KEY ?? '';
export const TILES_URL: string = env.VITE_TILES_URL || '/tiles/guwahati.pmtiles';
export const SITE_URL: string = (env.VITE_SITE_URL || location.origin).replace(/\/$/, '');

/** True when the backend is wired up. Without it the map still works, read-only. */
export const BACKEND_READY = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const GUWAHATI_CENTER: [number, number] = [91.7362, 26.1445];
