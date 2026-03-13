import { createClient } from "@supabase/supabase-js";

import { getEnv } from "@web/app/env";

import { Sentry } from "./sentry";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cachedAccessToken: string | null = null;

supabase.auth.getSession().then(({ data }) => {
  cachedAccessToken = data.session?.access_token ?? null;
});

supabase.auth.onAuthStateChange((event, session) => {
  const hadToken = cachedAccessToken !== null;
  cachedAccessToken = session?.access_token ?? null;

  if (hadToken && !cachedAccessToken && event !== "SIGNED_OUT") {
    Sentry.captureMessage("Auth token lost unexpectedly", {
      extra: { event, hadPreviousToken: hadToken },
    });
  }
});

export function getAccessToken(): string | null {
  return cachedAccessToken;
}
