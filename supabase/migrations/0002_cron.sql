-- Generated verbatim from SPEC.md v2 §6.3.
-- [HUMAN] prerequisites BEFORE applying: enable pg_cron + pg_net (Dashboard -> Database -> Extensions),
-- then create Vault secrets `service_role_key` and `project_url` in the SQL editor (never in a migration).

-- Times are UTC. IST = UTC + 5:30.
select cron.schedule('flag-outliers', '0 20 * * *',  $$select public.flag_outliers()$$);  -- 01:30 IST
select cron.schedule('run-matching',  '30 20 * * *', $$select public.run_matching()$$);   -- 02:00 IST
select cron.schedule('cleanup',       '0 21 * * *',  $$select public.cleanup()$$);        -- 02:30 IST

-- Digests at 09:00 IST
select cron.schedule('send-digests', '30 3 * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/send-digests',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
$$);
