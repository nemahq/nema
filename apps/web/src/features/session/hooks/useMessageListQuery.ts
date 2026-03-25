import type { Message } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

const MESSAGE_LIST_STALE_TIME_MS = 300_000;

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

type MessageListOutput = NonNullable<
  ReturnType<ReturnType<typeof trpc.useUtils>["message"]["list"]["getData"]>
>;

type MessageListBaseOptions = Omit<
  NonNullable<Parameters<typeof trpc.message.list.useSuspenseQuery>[1]>,
  "queryKey" | "select"
>;

export function useMessageListSuspenseQuery<TData = MessageListOutput>(
  input: { sessionId: string },
  options?: MessageListBaseOptions & {
    select?: (data: MessageListOutput) => TData;
  },
) {
  return trpc.message.list.useSuspenseQuery(input, {
    staleTime: MESSAGE_LIST_STALE_TIME_MS,
    ...options,
  }) as unknown as [
    TData,
    ReturnType<typeof trpc.message.list.useSuspenseQuery>[1],
  ];
}
