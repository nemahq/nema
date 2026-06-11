import { SourceCreateInputSchema } from "@nema-io/shared";

import { createSource } from "@server/services/source-service";
import { protectedProcedure, router } from "@server/trpc";

export const sourceRouter = router({
  create: protectedProcedure
    .input(SourceCreateInputSchema)
    .mutation(({ ctx, input }) =>
      createSource({
        supabase: ctx.supabase,
        body: input.body,
        sessionId: input.sessionId,
      }),
    ),
});
