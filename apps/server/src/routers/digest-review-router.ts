import {
  DigestReviewConfirmInputSchema,
  DigestReviewDiscardInputSchema,
  DigestReviewGetInputSchema,
  DigestReviewRestoreInputSchema,
  DigestReviewUpdateInputSchema,
} from "@nema-io/shared";

import {
  confirmReview,
  discardReview,
  getReview,
  restoreReview,
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

  discard: protectedProcedure
    .input(DigestReviewDiscardInputSchema)
    .mutation(({ ctx, input }) =>
      discardReview({ supabase: ctx.supabase, changesetId: input.changesetId }),
    ),

  restore: protectedProcedure
    .input(DigestReviewRestoreInputSchema)
    .mutation(({ ctx, input }) =>
      restoreReview({ supabase: ctx.supabase, changesetId: input.changesetId }),
    ),
});
