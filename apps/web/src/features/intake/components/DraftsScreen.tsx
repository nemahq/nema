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

        {/* key를 여기 걸면 초안을 바꿀 때마다 SidePanel까지 리마운트돼 사용자가
            드래그로 맞춰둔 폭이 초기화된다 — 초안별 리셋이 필요한 건 패널 내용물
            뿐이라 key는 DraftDetailPanel 안쪽에 있다. */}
        {selectedSourceId && (
          <DraftDetailPanel sourceId={selectedSourceId} onClose={handleClose} />
        )}
      </main>
    </DraftEditingProvider>
  );
}
