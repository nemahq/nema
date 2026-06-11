import { StatementSearchInputSchema } from "@nema-io/shared";

import { searchStatements } from "@server/services/statement-search";
import { providerProcedure, router } from "@server/trpc";

export const statementRouter = router({
  search: providerProcedure
    .input(StatementSearchInputSchema)
    .query(({ ctx, input }) =>
      searchStatements({
        supabase: ctx.supabase,
        providers: ctx.providers,
        query: input.query,
      }),
    ),
});
