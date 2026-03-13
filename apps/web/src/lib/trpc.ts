import {
  httpBatchLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";

import type { AppRouter } from "@nema-io/server/src/router";

import { getEnv } from "@web/app/env";

import { getAccessToken } from "./supabase";

export const trpc = createTRPCReact<AppRouter>();

function getTrpcUrl() {
  return import.meta.env.DEV ? "/trpc" : `${getEnv().API_URL}/trpc`;
}

function getAuthHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const trpcClient = trpc.createClient({
  links: [
    loggerLink({
      enabled: (opts) =>
        import.meta.env.DEV ||
        (opts.direction === "down" && opts.result instanceof Error),
    }),
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: getTrpcUrl(),
        connectionParams: () => {
          const token = getAccessToken();
          return token ? { token } : {};
        },
      }),
      false: httpBatchLink({
        url: getTrpcUrl(),
        headers: getAuthHeaders,
      }),
    }),
  ],
});
