import { OpenReviewScreen } from "@web/features/review";

interface OpenReviewPageProps {
  spacePublicId: string;
  changesetNumber: string;
}

export function OpenReviewPage({
  spacePublicId,
  changesetNumber,
}: OpenReviewPageProps) {
  return (
    <OpenReviewScreen
      spacePublicId={spacePublicId}
      changesetNumber={changesetNumber}
    />
  );
}
