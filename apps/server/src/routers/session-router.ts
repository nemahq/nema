import {
  SessionCreateInputSchema,
  SessionDeleteInputSchema,
  SessionGenerateTitleInputSchema,
  SessionGetInputSchema,
  SessionListInputSchema,
  SessionUpdateInputSchema,
} from "@nema-io/shared";

import { hasActiveGeneration } from "@server/infra/chat-stream-manager";
import { getProviders } from "@server/infra/providers";
import {
  createSession,
  deleteSession,
  generateSessionTitle,
  getSession,
  listSessions,
  updateSession,
} from "@server/services/session-service";
import { protectedProcedure, router } from "@server/trpc";

export const sessionRouter = router({
  get: protectedProcedure
    .input(SessionGetInputSchema)
    .query(async ({ ctx, input }) => {
      const session = await getSession(ctx.supabase, input);
      return {
        ...session,
        isGenerating: hasActiveGeneration(ctx.user.id, input.sessionId),
      };
    }),

  list: protectedProcedure
    .input(SessionListInputSchema)
    .query(({ ctx, input }) => listSessions(ctx.supabase, input)),

  create: protectedProcedure
    .input(SessionCreateInputSchema)
    .mutation(({ ctx, input }) =>
      createSession(ctx.supabase, {
        userId: ctx.user.id,
        sessionId: input.sessionId,
      }),
    ),

  update: protectedProcedure
    .input(SessionUpdateInputSchema)
    .mutation(({ ctx, input }) =>
      updateSession({
        supabase: ctx.supabase,
        sessionId: input.sessionId,
        title: input.title,
      }),
    ),

  generateTitle: protectedProcedure
    .input(SessionGenerateTitleInputSchema)
    .mutation(({ ctx, input }) =>
      generateSessionTitle({
        supabase: ctx.supabase,
        providers: getProviders(),
        ...input,
      }),
    ),

  delete: protectedProcedure
    .input(SessionDeleteInputSchema)
    .mutation(({ ctx, input }) => deleteSession(ctx.supabase, input)),
});
