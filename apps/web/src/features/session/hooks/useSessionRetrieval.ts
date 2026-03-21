import { trpc } from "@web/lib/trpc";

export function useSessionRetrieval({ sessionId }: { sessionId: string }) {
  const [session] = trpc.session.get.useSuspenseQuery(
    { sessionId },
    { staleTime: 300_000 },
  );
  return session.retrieval;
}
