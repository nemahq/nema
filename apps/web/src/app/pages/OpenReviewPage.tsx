import { OpenReviewScreen } from "@web/features/review";

interface OpenReviewPageProps {
  spacePublicId: string;
  changesetId: string;
}

export function OpenReviewPage({
  spacePublicId,
  changesetId,
}: OpenReviewPageProps) {
  return (
    <OpenReviewScreen spacePublicId={spacePublicId} changesetId={changesetId} />
  );
}
