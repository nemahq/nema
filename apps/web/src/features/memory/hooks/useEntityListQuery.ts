import type { EntityListInput } from "@nema-io/shared";

import { ENTITY_LIST_STALE_TIME_MS } from "@web/features/memory/constants";
import { trpc } from "@web/lib/trpc";

export function useEntityListSuspenseQuery(
  input: EntityListInput = {},
  options?: Omit<
    Parameters<typeof trpc.entity.list.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.entity.list.useSuspenseQuery(input, {
    staleTime: ENTITY_LIST_STALE_TIME_MS,
    ...options,
  });
}
