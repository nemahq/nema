import { trpc } from "@web/lib/trpc";

export function useSpacePendingDraftCountSuspenseQuery(spaceId: string) {
  return trpc.space.countPendingDrafts.useSuspenseQuery({ spaceId });
}
