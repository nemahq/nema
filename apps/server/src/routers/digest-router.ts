import {
  DIGEST_SEARCH_DEFAULT_LIMIT,
  DigestActionInputSchema,
  DigestSearchInputSchema,
} from "@nema-io/shared";

import { deleteDigest, searchDigests } from "@server/services/digest-service";
import { protectedProcedure, router } from "@server/trpc";

export const digestRouter = router({
  search: protectedProcedure
    .input(DigestSearchInputSchema)
    .query(({ ctx, input }) =>
      searchDigests({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        query: input.query,
        limit: input.limit ?? DIGEST_SEARCH_DEFAULT_LIMIT,
      }),
    ),

  delete: protectedProcedure
    .input(DigestActionInputSchema)
    .mutation(({ ctx, input }) =>
      deleteDigest({ supabase: ctx.supabase, digestId: input.digestId }),
    ),
});
