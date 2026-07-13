import type { Message } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

const MESSAGE_LIST_STALE_TIME_MS = 300_000;

export function addOptimisticMessage(
  utils: ReturnType<typeof trpc.useUtils>,
  sessionId: string,
  message: Message,
) {
  utils.message.list.setData({ sessionId }, (old) =>
    old ? [...old, message] : [message],
  );
}

export function useMessageListSuspenseQuery(
  input: { sessionId: string },
  options?: Omit<
    Parameters<typeof trpc.message.list.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.message.list.useSuspenseQuery(input, {
    staleTime: MESSAGE_LIST_STALE_TIME_MS,
    ...options,
  });
}
