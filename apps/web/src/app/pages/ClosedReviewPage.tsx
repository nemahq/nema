import { ClosedReviewScreen } from "@web/features/review";

interface ClosedReviewPageProps {
  spacePublicId: string;
  changesetNumber: string;
}

export function ClosedReviewPage({
  spacePublicId,
  changesetNumber,
}: ClosedReviewPageProps) {
  return (
    <ClosedReviewScreen
      spacePublicId={spacePublicId}
      changesetNumber={changesetNumber}
    />
  );
}
