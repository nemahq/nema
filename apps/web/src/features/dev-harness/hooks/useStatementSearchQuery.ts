import { trpc } from "@web/lib/trpc";

// 빈 질문은 보내지 않는다 — enabled 게이트가 필요해 Suspense 변형 대신 useQuery
export function useStatementSearchQuery(
  input: { query: string },
  options?: Omit<
    Parameters<typeof trpc.statement.search.useQuery>[1],
    "queryKey"
  >,
) {
  return trpc.statement.search.useQuery(input, {
    enabled: input.query.length > 0,
    ...options,
  });
}
