import { TrackEventInputSchema } from "@nema-io/shared";

import { trackEvent } from "@server/services/event-service";
import { protectedProcedure, router } from "@server/trpc";

export const eventRouter = router({
  track: protectedProcedure
    .input(TrackEventInputSchema)
    .mutation(({ ctx, input }) => {
      trackEvent(
        ctx.supabase,
        ctx.user.id,
        input.type,
        input.sessionId,
        input.payload as Record<string, unknown>,
      );
    }),
});
