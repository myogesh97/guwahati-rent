# ADR 0002: Privacy is enforced in the public views, not the client

- Status: accepted (migration 0010) · Recorded: 26 Nov 2026 (retroactive)

## Context
A society name or an exact flat size, combined with rent and a ~110 m location, can identify one household.

## Decision
`public_pins` exposes a society name only when 3+ pins within 300 m share it, and size only as `sqft_band`. Stats are medians over groups of 3+ within 18 months. Coordinates are rounded server-side (pins 3 dp, boards 4 dp). The base tables keep exact values for the owner's own edit form (`edit-pin` `load`).

## Consequences
- The client can never leak what the view never returns.
- The base table still holds identifying values, so backups and deletion must treat it as personal data (see PW-25, PW-26).
