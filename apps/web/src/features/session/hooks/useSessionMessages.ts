import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";

import { useMessageListSuspenseQuery } from "./useMessageListQuery";
import { useSessionId } from "./useSessionId";

export function useSessionMessages() {
  const sessionId = useSessionId();
  const { streamingMessage } = useChatLifecycle();
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
