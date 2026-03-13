import type { Message } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

export function useSendMessage({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();

  return trpc.message.chat.useMutation({
    async onMutate({ content }) {
      await utils.message.list.cancel({ sessionId });
      const previous = utils.message.list.getData({ sessionId });

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

      return { previous };
    },
    onError(_err, _vars, context) {
      if (context?.previous) {
        utils.message.list.setData({ sessionId }, context.previous);
      }
    },
    onSettled() {
      utils.message.list.invalidate({ sessionId });
    },
  });
}
