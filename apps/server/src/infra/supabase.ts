import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "@server/env";

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}
