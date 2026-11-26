# Security policy

Guwahati Rent is a small, volunteer-run project in maintenance mode. Security fixes are still made.

## Reporting a vulnerability

Please report privately, not in a public issue:

- GitHub: **Security → Report a vulnerability** on this repository (private advisory), or
- email m.yogesh0197@gmail.com with "Security" in the subject.

Include what you found, how to reproduce it, and what data it exposes. Please give us reasonable time to fix it before disclosing publicly.

In scope: the site at `guwahati-rent.netlify.app`, the Supabase Edge Functions and database rules in this repository, and the GitHub Actions workflows. Out of scope: Supabase, Netlify and Cloudflare themselves, denial-of-service, and social engineering.

Please don't access other people's data beyond what you need to show the problem, and don't run automated scanners that submit forms. Every submission is a real public record.

## What the design guarantees

- The public (anon) key can only read the `public_*` views and the `area_stats` function. Every write goes through an Edge Function that verifies Cloudflare Turnstile server-side and rate-limits.
- No names, emails or phone numbers are collected. Locations are rounded server-side (rent pins to 3 decimal places, ~110 m).
- No fields for community, religion, caste or ethnicity, ever.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `HASH_SALT`, `CRON_SECRET`) live only in Supabase function secrets, Vault or GitHub Actions secrets. They never go in a `VITE_` variable or in git.

## If a secret leaks

Rotate it first, then investigate. The steps for each secret are in [docs/wrap/HUMAN_REQUIRED.md](docs/wrap/HUMAN_REQUIRED.md) ("Incident runbook").
