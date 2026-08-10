import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "@server/env";
import type { Database } from "@server/infra/database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

let _admin: TypedSupabaseClient | null = null;

export function getSupabaseAdmin(): TypedSupabaseClient {
  if (!_admin) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
    _admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

// 요청 유저의 토큰으로 만든 클라이언트 — RLS(owner-only)가 소유 판정을 대신하므로
// 서비스 레이어가 user_id를 따로 체크하지 않는다.
export function createSupabaseUser(token: string): TypedSupabaseClient {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
