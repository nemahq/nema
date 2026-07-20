import { useCallback } from "react";

import { DraftEditingProvider } from "@web/features/intake/contexts/DraftEditingContext";

import { DraftDetailPanel } from "./DraftDetailPanel";
import { DraftList } from "./DraftList";
import { DraftsNavigationBar } from "./DraftsNavigationBar";

interface DraftsScreenProps {
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string | null) => void;
}

export function DraftsScreen({
  selectedSourceId,
  onSelectSource,
}: DraftsScreenProps) {
  const handleClose = useCallback(
    function closeDetail() {
      onSelectSource(null);
    },
    [onSelectSource],
  );

  return (
    <DraftEditingProvider>
      <main className="flex flex-1 bg-surface-card">
        <div className="flex min-h-0 flex-1 flex-col">
          <DraftsNavigationBar />
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-6 pb-8">
              <DraftList onSelectSource={onSelectSource} />
            </div>
          </div>
        </div>

        {selectedSourceId && (
          <DraftDetailPanel
            key={selectedSourceId}
            sourceId={selectedSourceId}
            onClose={handleClose}
          />
        )}
      </main>
    </DraftEditingProvider>
  );
}
