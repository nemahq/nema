import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { Sentry } from "@web/lib/sentry";
import { tolgee } from "@web/lib/tolgee/client";
import { toast } from "@web/utils/toast";

const DEFAULT_STALE_TIME_MS = 30_000;

function getErrorMessage(error: unknown): string {
  if (!navigator.onLine) {
    return tolgee.t("error.network");
  }
  if (error instanceof TRPCClientError) {
    return error.message;
  }
  return tolgee.t("common.unknown_error");
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
      if (!(error instanceof TRPCClientError)) {
        Sentry.captureException(error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError(error, _variables, _context, mutation) {
      if (!(error instanceof TRPCClientError)) {
        Sentry.captureException(error);
      }
      if (mutation.options.onError) {
        return;
      }
      toast.error(getErrorMessage(error));
    },
  }),
});
