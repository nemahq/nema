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
  create: protectedProcedure
    .input(SourceCreateInputSchema)
    .mutation(({ ctx, input }) =>
      createSource({
        supabase: ctx.supabase,
        providers: getProviders(),
        body: input.body,
        sessionId: input.sessionId,
        spaceId: input.spaceId,
        timeZone: input.timeZone,
      }),
    ),

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
