# ADR 0003: Static multi-page Vite site, no framework, self-hosted map

- Status: accepted · Recorded: 26 Nov 2026 (retroactive)

## Decision
Plain TypeScript and DOM, Vite multi-page build, MapLibre with self-hosted PMTiles, glyphs and sprite. One GeoJSON source for all pins (no DOM markers). Reads use `fetch` against PostgREST, not supabase-js (that stays only on the admin page).

## Why
Budget Android phones on 4G: the main bundle is ~20 KB gzipped; the 317 KB map chunk loads after first paint. No third-party runtime except Turnstile, which keeps the CSP strict.

## Consequences
- Large hand-written files (`main.css`, `index.html`).
- Mobile LCP 2.7 s is dominated by MapLibre; further gains need a static first paint or a lighter map library.
