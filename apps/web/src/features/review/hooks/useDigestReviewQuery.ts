import { trpc } from "@web/lib/trpc";

export function useDigestReviewSuspenseQuery(
  spaceId: string,
  changesetNumber: number,
) {
  return trpc.digestReview.get.useSuspenseQuery({
    spaceId,
    number: changesetNumber,
  });
}
