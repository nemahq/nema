import {
  SpaceCountPendingDraftsInputSchema,
  SpaceCreateInputSchema,
  SpaceDeleteInputSchema,
  SpaceUpdateInputSchema,
} from "@nema-io/shared";

import {
  countPendingDrafts,
  createSpace,
  deleteSpace,
  listSpaces,
  updateSpace,
} from "@server/services/space-service";
import { protectedProcedure, router } from "@server/trpc";

export const spaceRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listSpaces({ supabase: ctx.supabase }),
  ),

  create: protectedProcedure
    .input(SpaceCreateInputSchema)
    .mutation(({ ctx, input }) =>
      createSpace({ supabase: ctx.supabase, name: input.name }),
    ),

  update: protectedProcedure
    .input(SpaceUpdateInputSchema)
    .mutation(({ ctx, input }) =>
      updateSpace({
        supabase: ctx.supabase,
        spaceId: input.spaceId,
        name: input.name,
      }),
    ),

  delete: protectedProcedure
    .input(SpaceDeleteInputSchema)
    .mutation(({ ctx, input }) =>
      deleteSpace({
        supabase: ctx.supabase,
        spaceId: input.spaceId,
        targetSpaceId: input.targetSpaceId,
      }),
    ),

  countPendingDrafts: protectedProcedure
    .input(SpaceCountPendingDraftsInputSchema)
    .query(({ ctx, input }) =>
      countPendingDrafts({ supabase: ctx.supabase, spaceId: input.spaceId }),
    ),
});
