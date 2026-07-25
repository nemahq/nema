import { ChangesetDetailScreen } from "@web/features/review";

interface ChangesetDetailPageProps {
  changesetNumber: string;
}

export function ChangesetDetailPage({
  changesetNumber,
}: ChangesetDetailPageProps) {
  return <ChangesetDetailScreen changesetNumber={changesetNumber} />;
}
