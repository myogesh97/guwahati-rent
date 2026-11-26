# ADR 0005: Weekly pg_dump as a GitHub Actions artifact (needs revision)

- Status: **superseded pending owner decision** (PW-25) · Recorded: 26 Nov 2026

## Context
The Supabase free tier has no backups. `backup.yml` dumps the `public` schema weekly and keeps it as a 90-day workflow artifact.

## Problem
The repository is public. Artifacts of public repositories are listed by the unauthenticated API and downloadable by any signed-in GitHub user, so the dumps are effectively public.

## Options
1. Make the repository private. Simplest; artifacts become private.
2. Encrypt the dump with `age` to an offline public key (`BACKUP_AGE_RECIPIENT`) before upload; restore needs the private key.
3. Upload to private object storage instead.

Recommended: 1 now. Add 2 if the repo must be public again.
