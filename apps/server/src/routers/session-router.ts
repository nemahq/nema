import {
  SessionDeleteInputSchema,
  SessionListInputSchema,
} from "@nema-io/shared";

import {
  createSession,
  deleteSession,
  listSessions,
} from "../services/session-service";
import { protectedProcedure, router } from "../trpc";

export const sessionRouter = router({
  list: protectedProcedure
    .input(SessionListInputSchema)
    .query(({ ctx, input }) => listSessions(ctx.supabase, input)),

  create: protectedProcedure.mutation(({ ctx }) =>
    createSession(ctx.supabase, ctx.user.id),
  ),

  delete: protectedProcedure
    .input(SessionDeleteInputSchema)
    .mutation(({ ctx, input }) => deleteSession(ctx.supabase, input.sessionId)),
});
