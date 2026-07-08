import {
  TagDraftSchema,
  TagIdInputSchema,
  TagListInputSchema,
  UpdateTagInputSchema,
} from "@nema-io/shared";

import {
  archiveTag,
  createTag,
  listTags,
  restoreTag,
  updateTag,
} from "@server/services/tag-service";
import { protectedProcedure, router } from "@server/trpc";

export const tagRouter = router({
  list: protectedProcedure
    .input(TagListInputSchema)
    .query(({ ctx, input }) =>
      listTags({ supabase: ctx.supabase, scope: input.scope }),
    ),

  create: protectedProcedure.input(TagDraftSchema).mutation(({ ctx, input }) =>
    createTag({
      supabase: ctx.supabase,
      title: input.title,
      description: input.description,
    }),
  ),

  update: protectedProcedure
    .input(UpdateTagInputSchema)
    .mutation(({ ctx, input }) =>
      updateTag({
        supabase: ctx.supabase,
        id: input.id,
        title: input.title,
        description: input.description,
      }),
    ),

  archive: protectedProcedure
    .input(TagIdInputSchema)
    .mutation(({ ctx, input }) =>
      archiveTag({ supabase: ctx.supabase, id: input.id }),
    ),

  restore: protectedProcedure
    .input(TagIdInputSchema)
    .mutation(({ ctx, input }) =>
      restoreTag({ supabase: ctx.supabase, id: input.id }),
    ),
});
