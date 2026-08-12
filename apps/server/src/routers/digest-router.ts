import { TRPCError } from "@trpc/server";

import { DigestGetInputSchema } from "@nema-io/shared";

import { isNotFoundError } from "@server/infra/supabase/supabase-error";
import { getDigest, listDigests } from "@server/services/digest-service";
import { protectedProcedure, router } from "@server/trpc";

export const digestRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => ({
    digests: await listDigests({ supabase: ctx.supabase }),
  })),

  get: protectedProcedure
    .input(DigestGetInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getDigest({
          supabase: ctx.supabase,
          digestId: input.digestId,
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Digest not found.",
          });
        }
        throw error;
      }
    }),
});
