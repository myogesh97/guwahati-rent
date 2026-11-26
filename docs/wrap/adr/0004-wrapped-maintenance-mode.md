# ADR 0004: Project wrapped; Phase 3 and 4 cancelled

- Status: accepted by the owner on 26 Nov 2026 (STATUS.md) · Recorded: 26 Nov 2026

## Decision
No new features. Listings, seeker matching and email (Phase 3) and SEO locality pages (Phase 4) are cancelled. The site stays on the Netlify subdomain in maintenance mode: security fixes, bug fixes, dependency updates.

## Consequences
- The Phase 3 tables (`pin_contacts`, `seekers`, `seeker_contacts`, `matches`, `interests`), the `run_matching` function, `/unsubscribe.html` and the Phase 3 secrets in `.env.example` are now dead. Dropping them needs a migration (PW-17); until then they must stay empty and private.
- Weekly backups, keepalive and nightly rebuild must keep running, or the free project pauses.
