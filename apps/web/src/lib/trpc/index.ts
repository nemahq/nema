import {
  httpBatchStreamLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
  TRPCClientError,
  type TRPCLink,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";

import type { AppRouter } from "@nema-io/server/src/router";

import { getEnv } from "@web/app/env";
import { getAccessToken, sessionReady, supabase } from "@web/lib/supabase";
import { tolgee } from "@web/lib/tolgee/client";

export const trpc = createTRPCReact<AppRouter>();

function getTrpcUrl() {
  return import.meta.env.DEV ? "/trpc" : `${getEnv().API_URL}/trpc`;
}

async function getHeaders() {
  await sessionReady;
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

let isRedirectingToSignIn = false;

function authRedirectLink(): TRPCLink<AppRouter> {
  return () =>
    ({ next, op }) =>
      observable((observer) => {
        return next(op).subscribe({
          next: (value) => observer.next(value),
          error: (error) => {
            if (
              !isRedirectingToSignIn &&
              error instanceof TRPCClientError &&
              error.data?.code === "UNAUTHORIZED"
            ) {
              isRedirectingToSignIn = true;
              const redirect =
                window.location.pathname + window.location.search;
              supabase.auth.signOut().finally(() => {
                window.location.href = `/signin?redirect=${encodeURIComponent(redirect)}`;
              });
            }
            observer.error(error);
          },
          complete: () => observer.complete(),
        });
      });
}

export const trpcClient = trpc.createClient({
  links: [
    loggerLink({
      enabled: (opts) =>
        import.meta.env.DEV ||
        (opts.direction === "down" && opts.result instanceof Error),
    }),
    authRedirectLink(),
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: getTrpcUrl(),
        connectionParams: async () => {
          await sessionReady;
          const token = getAccessToken();
          const lang = tolgee.getLanguage();
          return { ...(token && { token }), ...(lang && { lang }) };
        },
      }),
      false: httpBatchStreamLink({
        url: getTrpcUrl(),
        headers: getHeaders,
      }),
    }),
  ],
});
