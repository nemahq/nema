import {
  DocumentDeleteInputSchema,
  DocumentGetInputSchema,
  DocumentListInputSchema,
} from "@nema-io/shared";

import {
  deleteDocument,
  getDocument,
  listDocuments,
} from "@server/services/document-service";
import { protectedProcedure, router } from "@server/trpc";

export const documentRouter = router({
  list: protectedProcedure
    .input(DocumentListInputSchema)
    .query(({ ctx, input }) => listDocuments(ctx.supabase, input)),

  get: protectedProcedure
    .input(DocumentGetInputSchema)
    .query(({ ctx, input }) => getDocument(ctx.supabase, input)),

  delete: protectedProcedure
    .input(DocumentDeleteInputSchema)
    .mutation(({ ctx, input }) =>
      deleteDocument(ctx.supabase, {
        documentId: input.documentId,
        userId: ctx.user.id,
      }),
    ),
});
