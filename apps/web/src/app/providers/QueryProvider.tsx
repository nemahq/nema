import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { tolgee } from "@web/lib/tolgee/client";

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: 0,
    },
  },
  mutationCache: new MutationCache({
    onError(error, _variables, _context, mutation) {
      if (mutation.options.onError) return;
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
