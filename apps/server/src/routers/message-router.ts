import {
  ChatInputSchema,
  DraftActionInputSchema,
  GetMessagesInputSchema,
  SendMessageInputSchema,
} from "@nema-io/shared";

import {
  cancelDraftAction,
  processChatStream,
  saveDraftAction,
} from "@server/services/chat-service";
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

  saveDraft: providerProcedure
    .input(DraftActionInputSchema)
    .mutation(({ ctx, input }) =>
      saveDraftAction({
        supabase: ctx.supabase,
        providers: ctx.providers,
        userId: ctx.user.id,
        sessionId: input.sessionId,
      }),
    ),

  cancelDraft: protectedProcedure
    .input(DraftActionInputSchema)
    .mutation(({ ctx, input }) =>
      cancelDraftAction({
        supabase: ctx.supabase,
        sessionId: input.sessionId,
      }),
    ),
});
