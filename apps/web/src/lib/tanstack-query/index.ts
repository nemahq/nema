import * as Sentry from "@sentry/react";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { supabase } from "@web/lib/supabase";
import { toastError } from "@web/utils/toast";

const DEFAULT_STALE_TIME_MS = 30_000;

let isRedirectingToSignIn = false;

function forceSignOut() {
  if (isRedirectingToSignIn) {
    return;
  }
  isRedirectingToSignIn = true;

  const redirectPath = window.location.pathname + window.location.search;
  supabase.auth.signOut().finally(() => {
    window.location.href = `/signin?redirect=${encodeURIComponent(redirectPath)}`;
  });
}

function isUnauthorizedError(error: unknown): boolean {
  return (
    error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED"
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: DEFAULT_STALE_TIME_MS,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError(error) {
      if (isUnauthorizedError(error)) {
        forceSignOut();
        return;
      }
      if (!(error instanceof TRPCClientError)) {
        Sentry.captureException(error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError(error, _variables, _context, mutation) {
      if (isUnauthorizedError(error)) {
        forceSignOut();
        return;
      }
      if (!(error instanceof TRPCClientError)) {
        Sentry.captureException(error);
      }
      if (mutation.meta?.skipGlobalToast) {
        return;
      }
      toastError(error);
    },
  }),
});
