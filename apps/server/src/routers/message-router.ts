import {
  ChatInputSchema,
  DraftActionInputSchema,
  GetMessagesInputSchema,
  SendMessageInputSchema,
} from "@nema-io/shared";

import { getProviders } from "@server/infra/providers";
import {
  cancelDraftAction,
  processChatStream,
  saveDraftAction,
} from "@server/services/chat-service";
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
        ctx.lng,
        signal,
      );
    }),

  saveDraft: protectedProcedure
    .input(DraftActionInputSchema)
    .mutation(({ ctx, input }) =>
      saveDraftAction(
        ctx.supabase,
        getProviders(),
        ctx.user.id,
        input.sessionId,
        ctx.lng,
      ),
    ),

  cancelDraft: protectedProcedure
    .input(DraftActionInputSchema)
    .mutation(({ ctx, input }) =>
      cancelDraftAction(ctx.supabase, input.sessionId),
    ),
});
