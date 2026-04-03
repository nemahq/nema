import {
  EntityGetDocumentsInputSchema,
  EntityGetRelatedInputSchema,
  EntityListInputSchema,
} from "@nema-io/shared";

import {
  getDocumentsByEntity,
  getRelatedEntities,
  getSummaryStats,
  listEntitiesWithStats,
} from "@server/services/entity-service";
import { providerProcedure, router } from "@server/trpc";

export const entityRouter = router({
  list: providerProcedure.input(EntityListInputSchema).query(({ ctx, input }) =>
    listEntitiesWithStats({
      graphStore: ctx.providers.graphStore,
      userId: ctx.user.id,
      input,
    }),
  ),

  getDocuments: providerProcedure
    .input(EntityGetDocumentsInputSchema)
    .query(({ ctx, input }) =>
      getDocumentsByEntity({
        graphStore: ctx.providers.graphStore,
        supabase: ctx.supabase,
        userId: ctx.user.id,
        input,
      }),
    ),

  getRelated: providerProcedure
    .input(EntityGetRelatedInputSchema)
    .query(({ ctx, input }) =>
      getRelatedEntities({
        graphStore: ctx.providers.graphStore,
        userId: ctx.user.id,
        input,
      }),
    ),

  stats: providerProcedure.query(({ ctx }) =>
    getSummaryStats({
      graphStore: ctx.providers.graphStore,
      supabase: ctx.supabase,
      userId: ctx.user.id,
    }),
  ),
});
