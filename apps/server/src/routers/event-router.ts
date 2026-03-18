import { TrackEventInputSchema } from "@nema-io/shared";

import { trackEvent } from "@server/services/event-service";
import { protectedProcedure, router } from "@server/trpc";

export const eventRouter = router({
  track: protectedProcedure
    .input(TrackEventInputSchema)
    .mutation(({ ctx, input }) => {
      trackEvent({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        type: input.type,
        sessionId: input.sessionId,
        payload: input.payload,
      });
    }),
});
