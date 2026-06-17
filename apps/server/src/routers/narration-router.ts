import { NarrationInputSchema } from "@nema-io/shared";

import { handleNarrationStream } from "@server/services/narration";
import { mapSubscriptionErrors, providerProcedure, router } from "@server/trpc";

export const narrationRouter = router({
  narrate: providerProcedure
    .input(NarrationInputSchema)
    .subscription(async function* ({ ctx, input, signal }) {
      yield* mapSubscriptionErrors(
        handleNarrationStream({
          supabase: ctx.supabase,
          providers: ctx.providers,
          query: input.query,
          topicIds: input.topicIds,
          signal,
        }),
        ctx.lng,
      );
    }),
});
