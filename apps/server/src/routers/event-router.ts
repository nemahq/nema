import { TrackEventInputSchema } from "@nema-io/shared";

import type { Json } from "@server/infra/database.types";
import { trackEvent } from "@server/services/event-service";
import { protectedProcedure, router } from "@server/trpc";

type JsonRecord = { [key: string]: Json | undefined };

export const eventRouter = router({
  track: protectedProcedure
    .input(TrackEventInputSchema)
    .mutation(({ ctx, input }) => {
      trackEvent({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        type: input.type,
        sessionId: input.sessionId,
        payload: input.payload as JsonRecord,
      });
    }),
});
