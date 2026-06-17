import { trpc } from "@web/lib/trpc";

// sourceId를 주면 그 원본의 진술이 양끝인 관계만, 없으면 전체 active 관계.
export function useActiveRelationsSuspenseQuery(
  input: { sourceId?: string } = {},
  options?: Omit<
    Parameters<typeof trpc.changeset.listActiveRelations.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.changeset.listActiveRelations.useSuspenseQuery(input, options);
}
