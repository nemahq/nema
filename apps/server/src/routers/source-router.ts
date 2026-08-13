import { TRPCError } from "@trpc/server";

import {
  SourceActionInputSchema,
  SourceIngestInputSchema,
} from "@nema-io/shared";

import { isNotFoundError } from "@server/infra/supabase/supabase-error";
import {
  deleteSource,
  getSource,
  ingestSource,
  reExtractSource,
} from "@server/services/source-service";
import { protectedProcedure, router } from "@server/trpc";

export const sourceRouter = router({
  get: protectedProcedure
    .input(SourceActionInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getSource({
          supabase: ctx.supabase,
          sourceId: input.sourceId,
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Source not found.",
            cause: error,
          });
        }
        throw error;
      }
    }),

  ingest: protectedProcedure
    .input(SourceIngestInputSchema)
    .mutation(({ ctx, input }) =>
      ingestSource({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        body: input.body,
      }),
    ),

  reExtract: protectedProcedure
    .input(SourceActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reExtractSource({
          supabase: ctx.supabase,
          userId: ctx.user.id,
          sourceId: input.sourceId,
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Source not found.",
            cause: error,
          });
        }
        throw error;
      }
    }),

  delete: protectedProcedure
    .input(SourceActionInputSchema)
    .mutation(({ ctx, input }) =>
      deleteSource({ supabase: ctx.supabase, sourceId: input.sourceId }),
    ),
});
