import { SourceCreateInputSchema, SourceGetInputSchema } from "@nema-io/shared";

import {
  createSource,
  getSource,
  listSources,
} from "@server/services/source-service";
import { protectedProcedure, router } from "@server/trpc";

export const sourceRouter = router({
  create: protectedProcedure
    .input(SourceCreateInputSchema)
    .mutation(({ ctx, input }) =>
      createSource({
        supabase: ctx.supabase,
        body: input.body,
        sessionId: input.sessionId,
        timeZone: input.timeZone,
      }),
    ),

  list: protectedProcedure.query(({ ctx }) =>
    listSources({ supabase: ctx.supabase }),
  ),

  get: protectedProcedure.input(SourceGetInputSchema).query(({ ctx, input }) =>
    getSource({
      supabase: ctx.supabase,
      sourceId: input.sourceId,
    }),
  ),
});
