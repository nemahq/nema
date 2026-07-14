import { ChangesetDetailScreen } from "@web/features/review";

interface ChangesetDetailPageProps {
  spacePublicId: string;
  changesetId: string;
}

export function ChangesetDetailPage({
  spacePublicId,
  changesetId,
}: ChangesetDetailPageProps) {
  return (
    <ChangesetDetailScreen
      spacePublicId={spacePublicId}
      changesetId={changesetId}
    />
  );
}
