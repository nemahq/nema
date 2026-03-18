import {
  ChatInputSchema,
  DraftActionInputSchema,
  GetMessagesInputSchema,
  SendMessageInputSchema,
} from "@nema-io/shared";

import { cancelDraftAction, processChatStream } from "@server/services/chat";
import { getMessages, sendMessage } from "@server/services/message-service";
import { protectedProcedure, providerProcedure, router } from "@server/trpc";

export const messageRouter = router({
  list: protectedProcedure
    .input(GetMessagesInputSchema)
    .query(({ ctx, input }) => getMessages(ctx.supabase, input.sessionId)),

  send: protectedProcedure
    .input(SendMessageInputSchema)
    .mutation(({ ctx, input }) => sendMessage(ctx.supabase, input)),

  chat: providerProcedure.input(ChatInputSchema).subscription(async function* ({
    ctx,
    input,
    signal,
  }) {
    yield* processChatStream({
      supabase: ctx.supabase,
      providers: ctx.providers,
      userId: ctx.user.id,
      input,
      lng: ctx.lng,
      signal,
    });
  }),

  cancelDraft: protectedProcedure
    .input(DraftActionInputSchema)
    .mutation(({ ctx, input }) =>
      cancelDraftAction({
        supabase: ctx.supabase,
        sessionId: input.sessionId,
      }),
    ),
});
