import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";

import { useMessageList } from "./useMessageList";
import { useSessionId } from "./useSessionId";

export function useSessionMessages() {
  const sessionId = useSessionId();
  const { streamingMessage } = useChatStream();
  const serverMessages = useMessageList({ sessionId });

  return streamingMessage
    ? [...serverMessages, streamingMessage]
    : serverMessages;
}
