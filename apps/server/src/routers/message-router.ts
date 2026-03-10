import {
  GetMessagesInputSchema,
  SendMessageInputSchema,
} from "@nema-io/shared";

import { getMessages, sendMessage } from "@server/services/message-service";
import { protectedProcedure, router } from "@server/trpc";

export const messageRouter = router({
  list: protectedProcedure
    .input(GetMessagesInputSchema)
    .query(({ ctx, input }) => getMessages(ctx.supabase, input.sessionId)),

  send: protectedProcedure
    .input(SendMessageInputSchema)
    .mutation(({ ctx, input }) => sendMessage(ctx.supabase, input)),
});
