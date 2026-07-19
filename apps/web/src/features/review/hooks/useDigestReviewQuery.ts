import { trpc } from "@web/lib/trpc";

export function useDigestReviewSuspenseQuery(spaceId: string, number: number) {
  return trpc.digestReview.get.useSuspenseQuery({ spaceId, number });
}
