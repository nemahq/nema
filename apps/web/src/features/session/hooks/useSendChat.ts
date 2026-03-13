import type { Message } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

export function useSendChat({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  return trpc.message.chat.useMutation({
    onMutate({ content }) {
      const optimistic: Message = {
        id: crypto.randomUUID(),
        role: "user",
        type: "text",
        content,
        createdAt: new Date().toISOString(),
      };

      utils.message.list.setData({ sessionId }, (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
    },
    onSettled() {
      utils.message.list.invalidate({ sessionId });
    },
  });
}
