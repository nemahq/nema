import {
  SourceActionInputSchema,
  SourceCreateInputSchema,
  SourceGetInputSchema,
  SourceReassignSpaceInputSchema,
  SourceUpdateBodyInputSchema,
  SourceUpdateTitleInputSchema,
} from "@nema-io/shared";

import { getProviders } from "@server/infra/providers";
import {
  cancelSourceDigestion,
  createSource,
  deleteSource,
  fillSourceTitle,
  getSource,
  listPendingSources,
  listSources,
  reassignSourceSpace,
  startSourceDigestion,
  updateSourceBody,
  updateSourceTitle,
} from "@server/services/source-service";
import { protectedProcedure, router } from "@server/trpc";

export const sourceRouter = router({
  // 제목 생성은 응답을 안 기다린다 — 박제(create_source)만 끝나면 사용자에겐 저장이
  // 끝난 것이고, 제목은 뒤늦게 채워져도 되는 부수효과다(fillSourceTitle이 안 던진다).
  create: protectedProcedure
    .input(SourceCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await createSource({
        supabase: ctx.supabase,
        body: input.body,
        sessionId: input.sessionId,
        spaceId: input.spaceId,
        timeZone: input.timeZone,
      });

      fillSourceTitle({
        supabase: ctx.supabase,
        providers: getProviders(),
        sourceId: result.sourceId,
        body: input.body,
      });

      return result;
    }),

  list: protectedProcedure.query(({ ctx }) =>
    listSources({ supabase: ctx.supabase }),
  ),

  listPending: protectedProcedure.query(({ ctx }) =>
    listPendingSources({ supabase: ctx.supabase }),
  ),

  get: protectedProcedure.input(SourceGetInputSchema).query(({ ctx, input }) =>
    getSource({
      supabase: ctx.supabase,
      sourceId: input.sourceId,
    }),
  ),

  cancelDigestion: protectedProcedure
    .input(SourceActionInputSchema)
    .mutation(({ ctx, input }) =>
      cancelSourceDigestion({
        supabase: ctx.supabase,
        sourceId: input.sourceId,
      }),
    ),

  startDigestion: protectedProcedure
    .input(SourceActionInputSchema)
    .mutation(({ ctx, input }) =>
      startSourceDigestion({
        supabase: ctx.supabase,
        sourceId: input.sourceId,
      }),
    ),

  delete: protectedProcedure
    .input(SourceActionInputSchema)
    .mutation(({ ctx, input }) =>
      deleteSource({
        supabase: ctx.supabase,
        sourceId: input.sourceId,
      }),
    ),

  reassignSpace: protectedProcedure
    .input(SourceReassignSpaceInputSchema)
    .mutation(({ ctx, input }) =>
      reassignSourceSpace({
        supabase: ctx.supabase,
        sourceId: input.sourceId,
        spaceId: input.spaceId,
      }),
    ),

  updateTitle: protectedProcedure
    .input(SourceUpdateTitleInputSchema)
    .mutation(({ ctx, input }) =>
      updateSourceTitle({
        supabase: ctx.supabase,
        sourceId: input.sourceId,
        title: input.title,
      }),
    ),

  updateBody: protectedProcedure
    .input(SourceUpdateBodyInputSchema)
    .mutation(({ ctx, input }) =>
      updateSourceBody({
        supabase: ctx.supabase,
        sourceId: input.sourceId,
        body: input.body,
      }),
    ),
});
