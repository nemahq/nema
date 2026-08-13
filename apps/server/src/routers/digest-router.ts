import {
  DIGEST_SEARCH_DEFAULT_LIMIT,
  DigestSearchInputSchema,
} from "@nema-io/shared";

import { searchDigests } from "@server/services/digest-service";
import { logSearch } from "@server/services/mcp-tool-call-log-service";
import { protectedProcedure, router } from "@server/trpc";

export const digestRouter = router({
  search: protectedProcedure
    .input(DigestSearchInputSchema)
    .query(async ({ ctx, input }) => {
      const results = await searchDigests({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        query: input.query,
        limit: input.limit ?? DIGEST_SEARCH_DEFAULT_LIMIT,
      });
      await logSearch({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        detail: {
          query: input.query,
          results: results.map((result) => ({
            digestId: result.id,
            score: result.score,
          })),
        },
      });
      return results;
    }),
});
