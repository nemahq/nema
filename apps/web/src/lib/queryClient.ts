import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { Sentry } from "@web/lib/sentry";
import { tolgee } from "@web/lib/tolgee/client";
import { toast } from "@web/utils/toast";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
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
      toast.error(
        error instanceof TRPCClientError
          ? error.message
          : tolgee.t("common.unknown_error"),
      );
    },
  }),
});
