import { TRPCError } from "@trpc/server";

import {
  SourceActionInputSchema,
  SourceDeleteManyInputSchema,
  SourceGetInputSchema,
  SourceIngestInputSchema,
  SourceListWithDigestsInputSchema,
} from "@nema-io/shared";

import { isNotFoundError } from "@server/infra/supabase/supabase-error";
import { SourceAlreadyProcessingError } from "@server/services/source-errors";
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
  // 다이제스트 목록 화면 — 원문 헤더 > 다이제스트 행의 2층 목록. 원문 단위 커서
  // 페이지네이션(SourceListWithDigestsCursorSchema 참고).
  listWithDigests: protectedProcedure
    .input(SourceListWithDigestsInputSchema)
    .query(({ ctx, input }) =>
      listSourcesWithDigests({
        supabase: ctx.supabase,
        cursor: input.cursor ?? null,
        limit: input.limit,
      }),
    ),

  // 초안 화면 — 다이제스트가 없는(정리 실패 또는 처리 중) 원문만.
  list: protectedProcedure.query(({ ctx }) =>
    listDraftSources({ supabase: ctx.supabase }),
  ),

  get: protectedProcedure
    .input(SourceGetInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getSource({
          supabase: ctx.supabase,
          userId: ctx.user.id,
          origin: ctx.origin,
          ...input,
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
    .mutation(async ({ ctx, input }) => {
      try {
        return await ingestSource({
          supabase: ctx.supabase,
          userId: ctx.user.id,
          body: input.body,
        });
      } catch (error) {
        // TRPCError로 옮겨야 code(CONFLICT)가 올바로 실린다 — 메시지 자체는
        // errorFormatter(trpc.ts)가 error-mapper.ts를 거쳐 다시 채운다.
        if (error instanceof SourceAlreadyProcessingError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Source is already being processed.",
            cause: error,
          });
        }
        throw error;
      }
    }),

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
        if (error instanceof SourceAlreadyProcessingError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Source is already being processed.",
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
