import {
  ApplyPendingRelationInputSchema,
  ArchiveStatementInputSchema,
  ListActiveRelationsInputSchema,
  ListChangesetsInputSchema,
  RejectPendingRelationInputSchema,
  RevertChangesetInputSchema,
} from "@nema-io/shared";

import {
  applyPendingRelation,
  archiveStatement,
  listActiveRelations,
  listChangesets,
  listPendingRelations,
  rejectPendingRelation,
  revertChangeset,
} from "@server/services/changeset-service";
import { protectedProcedure, router } from "@server/trpc";

export const changesetRouter = router({
  archiveStatement: protectedProcedure
    .input(ArchiveStatementInputSchema)
    .mutation(({ ctx, input }) =>
      archiveStatement({
        supabase: ctx.supabase,
        statementId: input.statementId,
      }),
    ),

  revert: protectedProcedure
    .input(RevertChangesetInputSchema)
    .mutation(({ ctx, input }) =>
      revertChangeset({
        supabase: ctx.supabase,
        changesetId: input.changesetId,
      }),
    ),

  applyPendingRelation: protectedProcedure
    .input(ApplyPendingRelationInputSchema)
    .mutation(({ ctx, input }) =>
      applyPendingRelation({
        supabase: ctx.supabase,
        changesetId: input.changesetId,
      }),
    ),

  rejectPendingRelation: protectedProcedure
    .input(RejectPendingRelationInputSchema)
    .mutation(({ ctx, input }) =>
      rejectPendingRelation({
        supabase: ctx.supabase,
        changesetId: input.changesetId,
      }),
    ),

  listPendingRelations: protectedProcedure.query(({ ctx }) =>
    listPendingRelations({ supabase: ctx.supabase }),
  ),

  listChangesets: protectedProcedure
    .input(ListChangesetsInputSchema)
    .query(({ ctx, input }) =>
      listChangesets({
        supabase: ctx.supabase,
        spaceId: input.spaceId,
        limit: input.limit,
      }),
    ),

  listActiveRelations: protectedProcedure
    .input(ListActiveRelationsInputSchema)
    .query(({ ctx, input }) =>
      listActiveRelations({
        supabase: ctx.supabase,
        sourceId: input.sourceId,
        limit: input.limit,
      }),
    ),
});
