import { ProfileUpdateInputSchema } from "@nema-io/shared";

import { getProfile, upsertProfile } from "@server/services/profile-service";
import { protectedProcedure, router } from "@server/trpc";

export const profileRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    getProfile({ supabase: ctx.supabase, userId: ctx.user.id }),
  ),

  update: protectedProcedure
    .input(ProfileUpdateInputSchema)
    .mutation(({ ctx, input }) =>
      upsertProfile({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        contentLanguage: input.contentLanguage,
      }),
    ),
});
