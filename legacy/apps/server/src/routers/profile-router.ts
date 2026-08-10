import { ProfileUpdateInputSchema } from "@nema-io/shared";

import { getProfile, upsertProfile } from "@server/services/profile-service";
import { protectedProcedure, router } from "@server/trpc";

export const profileRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    getProfile(ctx.supabase, { userId: ctx.user.id }),
  ),

  update: protectedProcedure
    .input(ProfileUpdateInputSchema)
    .mutation(({ ctx, input }) =>
      upsertProfile(ctx.supabase, {
        userId: ctx.user.id,
        contentLanguage: input.contentLanguage,
      }),
    ),
});
