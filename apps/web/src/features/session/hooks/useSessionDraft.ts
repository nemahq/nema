import { trpc } from "@web/lib/trpc";

export function useSessionDraft({ sessionId }: { sessionId: string }) {
  const [session] = trpc.session.get.useSuspenseQuery(
    { sessionId },
    { staleTime: Infinity },
  );
  return session.draft;
}
