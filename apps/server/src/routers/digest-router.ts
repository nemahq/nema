import { TRPCError } from "@trpc/server";

import {
  DIGEST_SEARCH_DEFAULT_LIMIT,
  DigestActionInputSchema,
  DigestGetInputSchema,
  DigestSearchInputSchema,
} from "@nema-io/shared";

import { isNotFoundError } from "@server/infra/supabase/supabase-error";
import { getDigestRelations } from "@server/services/digest-relation-service";
import {
  deleteDigest,
  getDigest,
  searchDigests,
} from "@server/services/digest-service";
import { protectedProcedure, router } from "@server/trpc";

function toNotFound(error: unknown): never {
  if (isNotFoundError(error)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Digest not found.",
      cause: error,
    });
  }
  throw error;
}

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

  get: protectedProcedure
    .input(DigestGetInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getDigest({
          supabase: ctx.supabase,
          userId: ctx.user.id,
          ...input,
        });
      } catch (error) {
        toNotFound(error);
      }
    }),

  getRelations: protectedProcedure
    .input(DigestActionInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getDigestRelations({
          supabase: ctx.supabase,
          userId: ctx.user.id,
          digestId: input.digestId,
        });
      } catch (error) {
        toNotFound(error);
      }
    }),

  delete: protectedProcedure
    .input(DigestActionInputSchema)
    .mutation(({ ctx, input }) =>
      deleteDigest({ supabase: ctx.supabase, digestId: input.digestId }),
    ),
});
