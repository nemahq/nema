import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { toastError } from "@web/utils/toast";

export { useMutation } from "./useMutation";

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
  queryCache: new QueryCache(),
  mutationCache: new MutationCache({
    onError(error, _variables, _context, mutation) {
      if (mutation.meta?.skipGlobalToast) {
        return;
      }
      toastError(error);
    },
  }),
});
