import {
  DigestReviewConfirmInputSchema,
  DigestReviewGetInputSchema,
  DigestReviewUpdateInputSchema,
} from "@nema-io/shared";

import {
  confirmReview,
  getReview,
  updateReview,
} from "@server/services/digest-review-service";
import { protectedProcedure, router } from "@server/trpc";

export const digestReviewRouter = router({
  get: protectedProcedure
    .input(DigestReviewGetInputSchema)
    .query(({ ctx, input }) =>
      getReview({ supabase: ctx.supabase, changesetId: input.changesetId }),
    ),

  update: protectedProcedure
    .input(DigestReviewUpdateInputSchema)
    .mutation(({ ctx, input }) =>
      updateReview({
        supabase: ctx.supabase,
        changesetId: input.changesetId,
        digests: input.digests,
        newReferences: input.newReferences,
      }),
    ),

  confirm: protectedProcedure
    .input(DigestReviewConfirmInputSchema)
    .mutation(({ ctx, input }) =>
      confirmReview({ supabase: ctx.supabase, changesetId: input.changesetId }),
    ),
});
