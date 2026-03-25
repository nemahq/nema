import { SESSION_STALE_TIME_MS } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

export function presetSessionCache(
  utils: ReturnType<typeof trpc.useUtils>,
  sessionId: string,
) {
  utils.session.get.setData(
    { sessionId },
    {
      id: sessionId,
      title: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: null,
      retrieval: null,
    },
  );
}

export function useSessionSuspenseQuery(
  input: { sessionId: string },
  options?: Omit<
    Parameters<typeof trpc.session.get.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.session.get.useSuspenseQuery(input, {
    staleTime: SESSION_STALE_TIME_MS,
    ...options,
  });
}
