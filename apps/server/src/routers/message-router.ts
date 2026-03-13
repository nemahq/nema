import {
  ChatInputSchema,
  GetMessagesInputSchema,
  SendMessageInputSchema,
} from "@nema-io/shared";

import { getProviders } from "@server/infra/providers";
import { processChatStream } from "@server/services/chat-service";
import { getMessages, sendMessage } from "@server/services/message-service";
import { protectedProcedure, router } from "@server/trpc";

export const messageRouter = router({
  list: protectedProcedure
    .input(GetMessagesInputSchema)
    .query(({ ctx, input }) => getMessages(ctx.supabase, input.sessionId)),

  send: protectedProcedure
    .input(SendMessageInputSchema)
    .mutation(({ ctx, input }) => sendMessage(ctx.supabase, input)),

  chat: protectedProcedure
    .input(ChatInputSchema)
    .subscription(async function* ({ ctx, input, signal }) {
      yield* processChatStream(
        ctx.supabase,
        getProviders(),
        ctx.user.id,
        input,
        signal,
      );
    }),
});
