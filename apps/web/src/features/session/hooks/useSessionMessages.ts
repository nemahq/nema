import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";

import { useMessageListSuspenseQuery } from "./useMessageListQuery";
import { useSessionId } from "./useSessionId";

export function useSessionMessages() {
  const sessionId = useSessionId();
  const { streamingMessage } = useChatStream();
  const [serverMessages] = useMessageListSuspenseQuery({ sessionId });

  return streamingMessage
    ? [...serverMessages, streamingMessage]
    : serverMessages;
}
