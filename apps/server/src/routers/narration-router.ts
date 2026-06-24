import { NarrationInputSchema } from "@nema-io/shared";

import { assembleEvidence } from "@server/services/assemble-evidence";
import {
  handleNarrationStream,
  narrateToText,
} from "@server/services/narration";
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

  // 산문을 입히지 않고 근거 묶음만 내보낸다. 외부 LLM이 원석 위에서 직접 합성하고 싶을 때.
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

  // 스트리밍 없이 산문까지 완성해 돌려준다 — nema가 추론을 소유해 결론금지·마커 규율을
  // 그대로 강제한다. 구독을 못 타는 입구(MCP tool)가 앱과 같은 해설을 받는 길.
  narrateText: providerProcedure
    .input(NarrationInputSchema)
    .query(({ ctx, input, signal }) =>
      narrateToText({
        supabase: ctx.supabase,
        providers: ctx.providers,
        query: input.query,
        timeZone: input.timeZone,
        signal,
      }),
    ),
});
