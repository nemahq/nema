import { ReferenceActionInputSchema } from "@nema-io/shared";

import {
  getReferenceCitingDigests,
  listReferences,
  trashReference,
} from "@server/services/reference-service";
import { protectedProcedure, router } from "@server/trpc";

export const referenceRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listReferences({ supabase: ctx.supabase }),
  ),

  citingDigests: protectedProcedure
    .input(ReferenceActionInputSchema)
    .query(({ ctx, input }) =>
      getReferenceCitingDigests({
        supabase: ctx.supabase,
        referenceId: input.referenceId,
      }),
    ),

  trash: protectedProcedure
    .input(ReferenceActionInputSchema)
    .mutation(({ ctx, input }) =>
      trashReference({
        supabase: ctx.supabase,
        referenceId: input.referenceId,
      }),
    ),
});
