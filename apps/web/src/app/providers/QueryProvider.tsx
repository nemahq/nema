import type { ReactNode } from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { toast } from "@nema-io/weave";

import { Sentry } from "@web/lib/sentry";
import { tolgee } from "@web/lib/tolgee/client";
import { trpc, trpcClient } from "@web/lib/trpc";

export const queryClient = new QueryClient({
  defaultOptions: {
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

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
