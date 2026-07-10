import * as Sentry from "@sentry/react";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { toastError } from "@web/utils/toast";

const DEFAULT_STALE_TIME_MS = 30_000;

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
    // TRPCClientError는 기본적으로 제외(예상된 거부·401 등 노이즈). 단 critical 쿼리는
    // meta.reportToSentry로 실패를 반드시 보고하게 opt-in한다(예: workspace.bootstrap).
    onError(error, query) {
      if (!(error instanceof TRPCClientError) || query.meta?.reportToSentry) {
        Sentry.captureException(error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError(error, _variables, _context, mutation) {
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
