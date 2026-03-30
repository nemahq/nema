import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";

import { useMessageListSuspenseQuery } from "./useMessageListQuery";
import { useSessionId } from "./useSessionId";

export function useSessionMessages() {
  const sessionId = useSessionId();
  const { streamingMessage } = useChatStream();
  const [serverMessages] = useMessageListSuspenseQuery({ sessionId });

  if (!streamingMessage) {
    return serverMessages;
  }

  const lastServerMsg = serverMessages.at(-1);
  const isDuplicate =
    lastServerMsg &&
    lastServerMsg.type === streamingMessage.type &&
    "content" in lastServerMsg &&
    lastServerMsg.content === streamingMessage.content;

  return isDuplicate ? serverMessages : [...serverMessages, streamingMessage];
}
