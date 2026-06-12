import { trpc } from "@web/lib/trpc";

export function useStatementSearchQuery(input: { query: string }) {
  return trpc.statement.search.useQuery(input, {
    enabled: input.query.length > 0,
  });
}
