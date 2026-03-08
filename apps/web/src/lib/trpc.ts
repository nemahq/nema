import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";

import type { AppRouter } from "@nema-io/server/src/router.js";

import { ENV } from "@web/app/env.js";

import { supabase } from "./supabase.js";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    loggerLink({
      enabled: (opts) =>
        import.meta.env.DEV ||
        (opts.direction === "down" && opts.result instanceof Error),
    }),
    httpBatchLink({
      url: `${ENV.API_URL}/trpc`,
      async headers() {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
