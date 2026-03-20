import type { Message } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

export function presetMessageCache(
  utils: ReturnType<typeof trpc.useUtils>,
  sessionId: string,
) {
  utils.message.list.setData({ sessionId }, []);
}

export function clearMessageCache(
  utils: ReturnType<typeof trpc.useUtils>,
  sessionId: string,
) {
  utils.message.list.setData({ sessionId }, undefined);
}

export function addOptimisticMessage(
  utils: ReturnType<typeof trpc.useUtils>,
  sessionId: string,
  message: Message,
) {
  utils.message.list.setData({ sessionId }, (old) =>
    old ? [...old, message] : [message],
  );
}

export function useMessageList({ sessionId }: { sessionId: string }) {
  const [messages] = trpc.message.list.useSuspenseQuery(
    { sessionId },
    { staleTime: Infinity },
  );
  return messages;
}
