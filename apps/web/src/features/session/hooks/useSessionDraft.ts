import { trpc } from "@web/lib/trpc";

import { useSessionId } from "./useSessionId";

export function useSessionDraft() {
  const sessionId = useSessionId();
  const [session] = trpc.session.get.useSuspenseQuery({ sessionId });
  return session.draft;
}
