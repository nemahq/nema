import {
  DraftAssistInputSchema,
  DraftConfirmInputSchema,
  DraftCreateInputSchema,
  DraftDeleteInputSchema,
  DraftEditInputSchema,
  DraftGetInputSchema,
} from "@nema-io/shared";

import { assistDraft } from "@server/services/draft-assist";
import {
  confirmDraft,
  createDraft,
  deleteDraft,
  editDraft,
  getDraft,
  listDrafts,
} from "@server/services/draft-service";
import { protectedProcedure, providerProcedure, router } from "@server/trpc";

export const draftRouter = router({
  assist: providerProcedure
    .input(DraftAssistInputSchema)
    .mutation(({ ctx, input }) =>
      assistDraft({ supabase: ctx.supabase, providers: ctx.providers, input }),
    ),

  create: protectedProcedure
    .input(DraftCreateInputSchema)
    .mutation(({ ctx, input }) =>
      createDraft({ supabase: ctx.supabase, input }),
    ),

  edit: protectedProcedure
    .input(DraftEditInputSchema)
    .mutation(({ ctx, input }) => editDraft({ supabase: ctx.supabase, input })),

  confirm: protectedProcedure
    .input(DraftConfirmInputSchema)
    .mutation(({ ctx, input }) =>
      confirmDraft({ supabase: ctx.supabase, input }),
    ),

  delete: protectedProcedure
    .input(DraftDeleteInputSchema)
    .mutation(({ ctx, input }) =>
      deleteDraft({ supabase: ctx.supabase, draftId: input.draftId }),
    ),

  list: protectedProcedure.query(({ ctx }) =>
    listDrafts({ supabase: ctx.supabase }),
  ),

  get: protectedProcedure
    .input(DraftGetInputSchema)
    .query(({ ctx, input }) =>
      getDraft({ supabase: ctx.supabase, draftId: input.draftId }),
    ),
});
