import { ClosedReviewScreen } from "@web/features/review";

interface ClosedReviewPageProps {
  spacePublicId: string;
  changesetId: string;
}

export function ClosedReviewPage({
  spacePublicId,
  changesetId,
}: ClosedReviewPageProps) {
  return (
    <ClosedReviewScreen
      spacePublicId={spacePublicId}
      changesetId={changesetId}
    />
  );
}
