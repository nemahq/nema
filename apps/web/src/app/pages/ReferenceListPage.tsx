import { ReferenceListScreen } from "@web/features/reference";

interface ReferenceListPageProps {
  selectedReferenceId: string | null;
  onSelectReference: (referenceId: string | null) => void;
}

export function ReferenceListPage({
  selectedReferenceId,
  onSelectReference,
}: ReferenceListPageProps) {
  return (
    <ReferenceListScreen
      selectedReferenceId={selectedReferenceId}
      onSelectReference={onSelectReference}
    />
  );
}
