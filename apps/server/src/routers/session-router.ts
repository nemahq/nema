import {
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
    .query(({ ctx, input }) => getSession(ctx.supabase, input.sessionId)),

  list: protectedProcedure
    .input(SessionListInputSchema)
    .query(({ ctx, input }) => listSessions(ctx.supabase, input)),

  create: protectedProcedure.mutation(({ ctx }) =>
    createSession(ctx.supabase, ctx.user.id),
  ),

  update: protectedProcedure
    .input(SessionUpdateInputSchema)
    .mutation(({ ctx, input }) =>
      updateSession(ctx.supabase, input.sessionId, input.title),
    ),

  delete: protectedProcedure
    .input(SessionDeleteInputSchema)
    .mutation(({ ctx, input }) => deleteSession(ctx.supabase, input.sessionId)),
});
