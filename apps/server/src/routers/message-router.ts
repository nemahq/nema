import {
  ChatInputSchema,
  DraftActionInputSchema,
  GetMessagesInputSchema,
  SendMessageInputSchema,
  SessionGetInputSchema,
} from "@nema-io/shared";

import {
  cancelDraftAction,
  dismissRetrievalAction,
  processChatStream,
} from "@server/services/chat";
import { getMessages, sendMessage } from "@server/services/message-service";
import {
  mapSubscriptionErrors,
  protectedProcedure,
  providerProcedure,
  router,
} from "@server/trpc";

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
    yield* mapSubscriptionErrors(
      processChatStream({
        supabase: ctx.supabase,
        providers: ctx.providers,
        userId: ctx.user.id,
        input,
        lng: ctx.lng,
        signal,
      }),
      ctx.lng,
    );
  }),

  cancelDraft: protectedProcedure
    .input(DraftActionInputSchema)
    .mutation(({ ctx, input }) =>
      cancelDraftAction({
        supabase: ctx.supabase,
        sessionId: input.sessionId,
      }),
    ),

  dismissRetrieval: protectedProcedure
    .input(SessionGetInputSchema)
    .mutation(({ ctx, input }) =>
      dismissRetrievalAction({
        supabase: ctx.supabase,
        sessionId: input.sessionId,
      }),
    ),
});
