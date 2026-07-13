import { trpc } from "@web/lib/trpc";

const SPACE_LIST_STALE_TIME_MS = 600_000;

export function useSpaceList(
  options?: Omit<Parameters<typeof trpc.space.list.useQuery>[1], "queryKey">,
) {
  return trpc.space.list.useQuery(undefined, {
    staleTime: SPACE_LIST_STALE_TIME_MS,
    ...options,
  });
}
