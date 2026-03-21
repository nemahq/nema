import { SESSION_STALE_TIME_MS } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

export function useSessionRetrieval({ sessionId }: { sessionId: string }) {
  const [session] = trpc.session.get.useSuspenseQuery(
    { sessionId },
    { staleTime: SESSION_STALE_TIME_MS },
  );
  return session.retrieval;
}
