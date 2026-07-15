import { trpc } from "@web/lib/trpc";

export function useSpacePendingDraftCount(spaceId: string) {
  return trpc.space.countPendingDrafts.useQuery({ spaceId });
}
