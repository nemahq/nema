import {
  ChatInputSchema,
  DraftActionInputSchema,
  GetMessagesInputSchema,
  SendMessageInputSchema,
  SessionGetInputSchema,
} from "@nema-io/shared";

import {
  hasActiveGeneration,
  runGeneration,
  subscribe,
} from "@server/infra/chat-stream-manager";
import {
  cancelDraftAction,
  cancelGenerationAction,
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
  }) {
    const { sessionId } = input;

    if (input.type === "resume" || hasActiveGeneration(sessionId)) {
      yield* mapSubscriptionErrors(subscribe(sessionId), ctx.lng);
      return;
    }

    void runGeneration(
      sessionId,
      processChatStream({
        supabase: ctx.supabase,
        providers: ctx.providers,
        userId: ctx.user.id,
        input,
        lng: ctx.lng,
      }),
    );

    yield* mapSubscriptionErrors(subscribe(sessionId), ctx.lng);
  }),

  cancelGeneration: protectedProcedure
    .input(SessionGetInputSchema)
    .mutation(({ input }) => cancelGenerationAction(input.sessionId)),

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
