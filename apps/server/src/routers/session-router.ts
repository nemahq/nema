import {
  SessionCreateInputSchema,
  SessionDeleteInputSchema,
  SessionGetInputSchema,
  SessionListInputSchema,
  SessionUpdateInputSchema,
} from "@nema-io/shared";

import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  updateSession,
} from "@server/services/session-service";
import { protectedProcedure, router } from "@server/trpc";

export const sessionRouter = router({
  get: protectedProcedure
    .input(SessionGetInputSchema)
    .query(({ ctx, input }) => getSession(ctx.supabase, input)),

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
      updateSession(ctx.supabase, input.sessionId, input.title),
    ),

  delete: protectedProcedure
    .input(SessionDeleteInputSchema)
    .mutation(({ ctx, input }) => deleteSession(ctx.supabase, input)),
});
