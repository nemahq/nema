import * as Sentry from "@sentry/react";
import { createClient } from "@supabase/supabase-js";

import { getEnv } from "@web/app/env";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data: initialSession } = await supabase.auth.getSession();
let cachedAccessToken: string | null =
  initialSession.session?.access_token ?? null;

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
