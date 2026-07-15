import { trpc } from "@web/lib/trpc";

export function useDigestReviewSuspenseQuery(changesetId: string) {
  return trpc.digestReview.get.useSuspenseQuery({ changesetId });
}
