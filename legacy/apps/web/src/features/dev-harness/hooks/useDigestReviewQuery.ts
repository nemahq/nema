import { trpc } from "@web/lib/trpc";

export function useDigestReviewQuery(spaceId: string, number: number) {
  return trpc.digestReview.get.useQuery({ spaceId, number });
}
