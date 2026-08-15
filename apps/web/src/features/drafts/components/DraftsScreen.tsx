import { SidePanel } from "@web/components/ui/SidePanel";

import { DraftDetailPanel } from "./DraftDetailPanel";
import { DraftList } from "./DraftList";
import { DraftsNavigationBar } from "./DraftsNavigationBar";

interface DraftsScreenProps {
  selectedSourcePublicId: string | null;
  onSelectSource: (sourcePublicId: string | null) => void;
}

export function DraftsScreen({
  selectedSourcePublicId,
  onSelectSource,
}: DraftsScreenProps) {
  function handleClose() {
    onSelectSource(null);
  }

  return (
    <main className="flex flex-1 bg-surface-card">
      <div className="flex min-h-0 flex-1 flex-col">
        <DraftsNavigationBar />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-6 pb-8">
            <DraftList onSelectSource={onSelectSource} />
          </div>
        </div>
      </div>

      {selectedSourcePublicId && (
        <SidePanel boundaryName="draft-detail" onClose={handleClose}>
          <DraftDetailPanel
            sourcePublicId={selectedSourcePublicId}
            onClose={handleClose}
          />
        </SidePanel>
      )}
    </main>
  );
}
