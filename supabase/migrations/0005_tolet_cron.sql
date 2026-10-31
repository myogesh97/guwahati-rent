-- 0005: nightly To-Let cleanup (NEXT-PHASES.md §2a.6). Files can't be deleted from SQL, so the
-- tolet-maintenance Edge Function does the work; this job only calls it.
-- Protected by a dedicated CRON_SECRET (not the service role key; key formats differ between projects).
--
-- [HUMAN] first: create Vault secrets in the SQL editor (never in a migration file):
--   select vault.create_secret('https://apgdczuofczobxaggsfy.supabase.co', 'project_url');  -- skip if it already exists
--   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
-- The job only reads them when it runs, so this migration applies without them.

select cron.schedule('tolet-maintenance', '45 21 * * *', $$   -- 03:15 IST
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/tolet-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
$$);
