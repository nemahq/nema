import { trpc } from "@web/lib/trpc";

import { useSessionId } from "./useSessionId";

export function useMessageList() {
  const sessionId = useSessionId();
  const [messages] = trpc.message.list.useSuspenseQuery({ sessionId });
  return messages;
}
