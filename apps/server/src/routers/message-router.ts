import {
  ChatInputSchema,
  ConfirmDraftIntentInputSchema,
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
  confirmDraftIntentStream,
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
    const userId = ctx.user.id;

    if (input.type === "resume" || hasActiveGeneration(userId, sessionId)) {
      yield* mapSubscriptionErrors(subscribe(userId, sessionId), ctx.lng);
      return;
    }

    const abortController = new AbortController();

    // 생성을 현재 SSE 연결과 독립적으로 실행한다.
    // 클라이언트가 끊겨도 서버에서 끝까지 완료되며, subscribe로 이벤트를 받는다.
    void runGeneration({
      userId,
      sessionId,
      stream: processChatStream({
        supabase: ctx.supabase,
        providers: ctx.providers,
        userId,
        input,
        lng: ctx.lng,
        signal: abortController.signal,
      }),
      abortController,
    });

    yield* mapSubscriptionErrors(subscribe(userId, sessionId), ctx.lng);
  }),

  cancelGeneration: protectedProcedure
    .input(SessionGetInputSchema)
    .mutation(({ ctx, input }) =>
      cancelGenerationAction(ctx.user.id, input.sessionId),
    ),

  cancelDraft: protectedProcedure
    .input(DraftActionInputSchema)
    .mutation(({ ctx, input }) =>
      cancelDraftAction({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        sessionId: input.sessionId,
      }),
    ),

  confirmDraftIntent: providerProcedure
    .input(ConfirmDraftIntentInputSchema)
    .subscription(async function* ({ ctx, input, signal }) {
      yield* confirmDraftIntentStream({
        supabase: ctx.supabase,
        providers: ctx.providers,
        userId: ctx.user.id,
        input,
        signal,
      });
    }),

  dismissRetrieval: protectedProcedure
    .input(SessionGetInputSchema)
    .mutation(({ ctx, input }) =>
      dismissRetrievalAction({
        supabase: ctx.supabase,
        sessionId: input.sessionId,
      }),
    ),
});
