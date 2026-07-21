import {
  ReferenceActionInputSchema,
  ReferenceTagActionInputSchema,
  ReferenceUpdateInputSchema,
} from "@nema-io/shared";

import {
  addReferenceTag,
  archiveReference,
  getReference,
  getReferenceCitingDigests,
  listReferences,
  removeReferenceTag,
  trashReference,
  updateReference,
} from "@server/services/reference-service";
import { protectedProcedure, router } from "@server/trpc";

export const referenceRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listReferences({ supabase: ctx.supabase }),
  ),

  get: protectedProcedure
    .input(ReferenceActionInputSchema)
    .query(({ ctx, input }) =>
      getReference({ supabase: ctx.supabase, referenceId: input.referenceId }),
    ),

  citingDigests: protectedProcedure
    .input(ReferenceActionInputSchema)
    .query(({ ctx, input }) =>
      getReferenceCitingDigests({
        supabase: ctx.supabase,
        referenceId: input.referenceId,
      }),
    ),

  update: protectedProcedure
    .input(ReferenceUpdateInputSchema)
    .mutation(({ ctx, input }) =>
      updateReference({
        supabase: ctx.supabase,
        referenceId: input.referenceId,
        type: input.type,
        title: input.title,
        body: input.body,
        externalUrls: input.externalUrls,
      }),
    ),

  archive: protectedProcedure
    .input(ReferenceActionInputSchema)
    .mutation(({ ctx, input }) =>
      archiveReference({
        supabase: ctx.supabase,
        referenceId: input.referenceId,
      }),
    ),

  addTag: protectedProcedure
    .input(ReferenceTagActionInputSchema)
    .mutation(({ ctx, input }) =>
      addReferenceTag({
        supabase: ctx.supabase,
        referenceId: input.referenceId,
        tagId: input.tagId,
      }),
    ),

  removeTag: protectedProcedure
    .input(ReferenceTagActionInputSchema)
    .mutation(({ ctx, input }) =>
      removeReferenceTag({
        supabase: ctx.supabase,
        referenceId: input.referenceId,
        tagId: input.tagId,
      }),
    ),

  trash: protectedProcedure
    .input(ReferenceActionInputSchema)
    .mutation(({ ctx, input }) =>
      trashReference({
        supabase: ctx.supabase,
        referenceId: input.referenceId,
      }),
    ),
});
