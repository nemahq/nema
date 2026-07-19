import { ChangesetDetailScreen } from "@web/features/review";

interface ChangesetDetailPageProps {
  spacePublicId: string;
  changesetNumber: string;
}

export function ChangesetDetailPage({
  spacePublicId,
  changesetNumber,
}: ChangesetDetailPageProps) {
  return (
    <ChangesetDetailScreen
      spacePublicId={spacePublicId}
      changesetNumber={changesetNumber}
    />
  );
}
