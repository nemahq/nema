import { DigestReviewScreen } from "@web/features/review";

interface DigestReviewPageProps {
  spacePublicId: string;
  changesetId: string;
}

export function DigestReviewPage({
  spacePublicId,
  changesetId,
}: DigestReviewPageProps) {
  return (
    <DigestReviewScreen
      spacePublicId={spacePublicId}
      changesetId={changesetId}
    />
  );
}
