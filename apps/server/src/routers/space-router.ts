import {
  SpaceCreateInputSchema,
  SpaceDeleteInputSchema,
  SpaceRenameInputSchema,
} from "@nema-io/shared";

import {
  createSpace,
  deleteSpace,
  listSpaces,
  renameSpace,
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

  rename: protectedProcedure
    .input(SpaceRenameInputSchema)
    .mutation(({ ctx, input }) =>
      renameSpace({
        supabase: ctx.supabase,
        spaceId: input.spaceId,
        name: input.name,
      }),
    ),

  delete: protectedProcedure
    .input(SpaceDeleteInputSchema)
    .mutation(({ ctx, input }) =>
      deleteSpace({ supabase: ctx.supabase, spaceId: input.spaceId }),
    ),
});
