import { trpc } from "@web/lib/trpc";

const SESSION_STALE_TIME_MS = 300_000;

export function useSessionDraft({ sessionId }: { sessionId: string }) {
  const [session] = trpc.session.get.useSuspenseQuery(
    { sessionId },
    { staleTime: SESSION_STALE_TIME_MS },
  );
  return session.draft;
}
