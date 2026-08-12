import {
  DigestActionInputSchema,
  DigestEditConfirmInputSchema,
  DigestListInputSchema,
} from "@nema-io/shared";

import { confirmDigestEdit } from "@server/services/digest-review-service";
import {
  archiveDigest,
  listDigests,
  restoreDigest,
} from "@server/services/digest-service";
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

  list: protectedProcedure
    .input(DigestListInputSchema)
    .query(({ ctx, input }) =>
      listDigests({
        supabase: ctx.supabase,
        spaceId: input.spaceId,
        topicId: input.topicId,
        staleOnly: input.staleOnly,
        cursor: input.cursor,
        limit: input.limit,
      }),
    ),

  archive: protectedProcedure
    .input(DigestActionInputSchema)
    .mutation(({ ctx, input }) =>
      archiveDigest({ supabase: ctx.supabase, digestId: input.digestId }),
    ),

  restore: protectedProcedure
    .input(DigestActionInputSchema)
    .mutation(({ ctx, input }) =>
      restoreDigest({
        supabase: ctx.supabase,
        digestId: input.digestId,
        lng: ctx.lng,
      }),
    ),
});
