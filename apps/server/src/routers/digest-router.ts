import { DigestEditConfirmInputSchema } from "@nema-io/shared";

import { confirmDigestEdit } from "@server/services/digest-review-service";
import { protectedProcedure, router } from "@server/trpc";

export const digestRouter = router({
  editConfirm: protectedProcedure
    .input(DigestEditConfirmInputSchema)
    .mutation(({ ctx, input }) =>
      confirmDigestEdit({
        supabase: ctx.supabase,
        digestId: input.digestId,
        digest: input.digest,
        newReferences: input.newReferences,
      }),
    ),
});
