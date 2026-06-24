import { NarrationInputSchema } from "@nema-io/shared";

import { assembleEvidence } from "@server/services/assemble-evidence";
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
          timeZone: input.timeZone,
          signal,
        }),
        ctx.lng,
      );
    }),

  // 산문을 입히지 않고 근거 묶음만 내보낸다. 외부 LLM(MCP)이 원석 위에서 직접 합성한다.
  evidence: providerProcedure
    .input(NarrationInputSchema)
    .query(({ ctx, input }) =>
      assembleEvidence({
        supabase: ctx.supabase,
        providers: ctx.providers,
        query: input.query,
        timeZone: input.timeZone,
      }),
    ),
});
