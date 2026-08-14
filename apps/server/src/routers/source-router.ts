import { TRPCError } from "@trpc/server";

import {
  SourceActionInputSchema,
  SourceDeleteManyInputSchema,
  SourceIngestInputSchema,
} from "@nema-io/shared";

import { isNotFoundError } from "@server/infra/supabase/supabase-error";
import {
  deleteSource,
  deleteSources,
  getSource,
  ingestSource,
  listDraftSources,
  listSourcesWithDigests,
  reExtractSource,
} from "@server/services/source-service";
import { protectedProcedure, router } from "@server/trpc";

export const sourceRouter = router({
  // 다이제스트 목록 화면 — 원문 헤더 > 다이제스트 행의 2층 목록.
  listWithDigests: protectedProcedure.query(({ ctx }) =>
    listSourcesWithDigests({ supabase: ctx.supabase }),
  ),

  // 초안 화면 — 다이제스트가 없는(정리 실패 또는 처리 중) 원문만.
  list: protectedProcedure.query(({ ctx }) =>
    listDraftSources({ supabase: ctx.supabase }),
  ),

  get: protectedProcedure
    .input(SourceActionInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getSource({
          supabase: ctx.supabase,
          userId: ctx.user.id,
          sourceId: input.sourceId,
          origin: ctx.origin,
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

  // 초안 화면 벌크 삭제 — 개별 tRPC 호출로 묶지 않는 이유는
  // SourceDeleteManyInputSchema 주석(#432) 참고.
  deleteMany: protectedProcedure
    .input(SourceDeleteManyInputSchema)
    .mutation(({ ctx, input }) =>
      deleteSources({ supabase: ctx.supabase, sourceIds: input.sourceIds }),
    ),
});
