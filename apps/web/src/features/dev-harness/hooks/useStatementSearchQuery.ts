import { trpc } from "@web/lib/trpc";

// 빈 질문은 보내지 않는다 — enabled 게이트가 필요해 Suspense 변형 대신 useQuery
export function useStatementSearchQuery(
  input: { query: string },
  options?: Omit<
    Parameters<typeof trpc.statement.search.useQuery>[1],
    "queryKey"
  >,
) {
  // 사용자 존을 실어 보낸다 — 시간 질의("이번 주 마감")를 이 존 기준으로 풀게 한다.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return trpc.statement.search.useQuery(
    { ...input, timeZone },
    {
      enabled: input.query.length > 0,
      ...options,
    },
  );
}
