import { trpc } from "@web/lib/trpc";

export function useDigestReviewQuery(changesetId: string) {
  return trpc.digestReview.get.useQuery({ changesetId });
}
