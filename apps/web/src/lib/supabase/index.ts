import { createClient } from "@supabase/supabase-js";

import { getEnv } from "@web/app/env";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cachedAccessToken: string | null = null;

export const sessionReady = supabase.auth.getSession().then(({ data }) => {
  cachedAccessToken = data.session?.access_token ?? null;
});

supabase.auth.onAuthStateChange((event, session) => {
  const hadToken = cachedAccessToken !== null;
  cachedAccessToken = session?.access_token ?? null;

  if (hadToken && !cachedAccessToken && event !== "SIGNED_OUT") {
    // eslint-disable-next-line no-console -- Sentry 없이 남은 유일한 신호
    console.warn("Auth token lost unexpectedly", { event, hadToken });
  }
});

export function getAccessToken(): string | null {
  return cachedAccessToken;
}
