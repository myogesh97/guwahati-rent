Self-hosted map assets (SPEC §15 Phase 4: self-host glyphs + sprite).

- `fonts/` — Noto Sans glyph ranges from github.com/protomaps/basemaps-assets (SIL Open Font License, see fonts/OFL.txt).
  Only the ranges Guwahati labels need are kept: Latin/Greek/Cyrillic, Devanagari + Bengali/Assamese, punctuation and currency (₹), symbols.
  If a label in another script shows up blank, copy that range in from the repo.
- `sprites/` — Protomaps v4 "light" sprite (matches tile schema v4 / @protomaps/basemaps v5).
