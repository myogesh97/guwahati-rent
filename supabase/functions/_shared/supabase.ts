import { createClient } from 'npm:@supabase/supabase-js@2';

// Service-role client. Bypasses RLS — only ever used inside Edge Functions.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the Edge runtime.
export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
