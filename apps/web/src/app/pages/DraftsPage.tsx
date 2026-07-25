import { DraftsScreen } from "@web/features/intake";

interface DraftsPageProps {
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string | null) => void;
}

export function DraftsPage({
  selectedSourceId,
  onSelectSource,
}: DraftsPageProps) {
  return (
    <DraftsScreen
      selectedSourceId={selectedSourceId}
      onSelectSource={onSelectSource}
    />
  );
}
