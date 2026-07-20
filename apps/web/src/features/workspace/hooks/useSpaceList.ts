import { trpc } from "@web/lib/trpc";

export const SPACE_LIST_STALE_TIME_MS = 600_000;

export function useSpaceList(
  options?: Omit<Parameters<typeof trpc.space.list.useQuery>[1], "queryKey">,
) {
  return trpc.space.list.useQuery(undefined, {
    staleTime: SPACE_LIST_STALE_TIME_MS,
    ...options,
    meta: { reportToSentry: true },
  });
}

export function useSpaceListSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.space.list.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.space.list.useSuspenseQuery(undefined, {
    staleTime: SPACE_LIST_STALE_TIME_MS,
    ...options,
    meta: { reportToSentry: true },
  });
}
