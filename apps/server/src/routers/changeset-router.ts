import {
  ArchiveStatementInputSchema,
  GetChangesetByNumberInputSchema,
  GetPendingRelationByNumberInputSchema,
  ListActiveRelationsInputSchema,
  ListChangesetsInputSchema,
  ManualChangeHistoryInputSchema,
  RejectPendingRelationInputSchema,
  ResolveConflictRelationInputSchema,
  ResolveDuplicateRelationInputSchema,
  RestorePendingRelationInputSchema,
  RevertChangesetInputSchema,
} from "@nema-io/shared";

import {
  getChangesetByNumber,
  getPendingRelationByNumber,
} from "@server/services/changeset-detail-service";
import {
  archiveStatement,
  listActiveRelations,
  listChangesets,
  listManualChangeHistory,
  listPendingRelations,
  rejectPendingRelation,
  resolveConflictRelation,
  resolveDuplicateRelation,
  restorePendingRelation,
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

  resolveConflictRelation: protectedProcedure
    .input(ResolveConflictRelationInputSchema)
    .mutation(({ ctx, input }) =>
      resolveConflictRelation({
        supabase: ctx.supabase,
        changesetId: input.changesetId,
        winnerStatementId: input.winnerStatementId,
      }),
    ),

  resolveDuplicateRelation: protectedProcedure
    .input(ResolveDuplicateRelationInputSchema)
    .mutation(({ ctx, input }) =>
      resolveDuplicateRelation({
        supabase: ctx.supabase,
        changesetId: input.changesetId,
        mergedDigest: input.mergedDigest,
        newReferences: input.newReferences,
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

  restorePendingRelation: protectedProcedure
    .input(RestorePendingRelationInputSchema)
    .mutation(({ ctx, input }) =>
      restorePendingRelation({
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
        open: input.open,
        cursor: input.cursor,
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

  getByNumber: protectedProcedure
    .input(GetChangesetByNumberInputSchema)
    .query(({ ctx, input }) =>
      getChangesetByNumber({
        supabase: ctx.supabase,
        spaceId: input.spaceId,
        number: input.number,
      }),
    ),

  getPendingRelationByNumber: protectedProcedure
    .input(GetPendingRelationByNumberInputSchema)
    .query(({ ctx, input }) =>
      getPendingRelationByNumber({
        supabase: ctx.supabase,
        spaceId: input.spaceId,
        number: input.number,
      }),
    ),

  manualHistory: protectedProcedure
    .input(ManualChangeHistoryInputSchema)
    .query(({ ctx, input }) =>
      listManualChangeHistory({
        supabase: ctx.supabase,
        targetType: input.targetType,
        targetId: input.targetId,
      }),
    ),
});
