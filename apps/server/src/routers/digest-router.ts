import { DigestGetInputSchema } from "@nema-io/shared";

import { getDigest, listDigests } from "@server/services/digest-service";
import { protectedProcedure, router } from "@server/trpc";

export const digestRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => ({
    digests: await listDigests({ supabase: ctx.supabase }),
  })),

  get: protectedProcedure
    .input(DigestGetInputSchema)
    .query(async ({ ctx, input }) =>
      getDigest({
        supabase: ctx.supabase,
        digestId: input.digestId,
      }),
    ),
});
