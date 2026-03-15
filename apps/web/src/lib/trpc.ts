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
import { tolgee } from "./tolgee/client";

export const trpc = createTRPCReact<AppRouter>();

function getTrpcUrl() {
  return import.meta.env.DEV ? "/trpc" : `${getEnv().API_URL}/trpc`;
}

function getHeaders() {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const lang = tolgee.getLanguage();
  if (lang) {
    headers["Accept-Language"] = lang;
  }
  return headers;
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
          const lang = tolgee.getLanguage();
          return { ...(token && { token }), ...(lang && { lang }) };
        },
      }),
      false: httpBatchLink({
        url: getTrpcUrl(),
        headers: getHeaders,
      }),
    }),
  ],
});
