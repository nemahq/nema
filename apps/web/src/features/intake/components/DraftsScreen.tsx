import { useState } from "react";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { LoadingWatermark } from "@web/components/ui/LoadingWatermark";
import { SidePanel } from "@web/components/ui/SidePanel";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import type { DraftCardData } from "@web/features/intake/types";
import { draftStatus } from "@web/features/intake/utils";
import { useTranslation } from "@web/lib/tolgee";

import { DraftList } from "./DraftList";
import { IdleDraftDetailPanel } from "./IdleDraftDetailPanel";
import { WorkingDraftDetailPanel } from "./WorkingDraftDetailPanel";

export function DraftsScreen() {
  const { t } = useTranslation();
  const pendingQuery = usePendingSourceListQuery();
  // 선택된 초안 자체가 아니라 id만 든다 — 목록은 폴링으로 계속 최신화되는데
  // 클릭 시점 스냅샷을 그대로 들고 있으면, 열어둔 패널이 그 갱신(타이틀 도착,
  // processing→완료/실패 전환)을 영영 못 본다. 매 렌더 최신 쿼리 데이터에서
  // 다시 찾아 만든다.
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  // 결과없음 카드의 상태 아이콘은 "아직 원문을 안 고쳤다"는 신호라, 상세에서
  // 실제로 고치는 순간(재생성 버튼이 풀리는 시점과 동일 조건) 리스트 카드에서도
  // 같이 사라져야 한다 — 카드와 상세가 서로 다른 컴포넌트라 이 여닫이 상태를
  // 공통 부모(여기)가 들고 있다가 양쪽에 내려준다.
  const [editedDraftId, setEditedDraftId] = useState<string | null>(null);

  const selectedSource = pendingQuery.data?.items.find(
    (item) => item.sourceId === selectedSourceId,
  );
  const selectedStatus = selectedSource ? draftStatus(selectedSource) : null;
  const selectedDraft: DraftCardData | null =
    selectedSource && selectedStatus
      ? {
          sourceId: selectedSource.sourceId,
          spaceId: selectedSource.spaceId,
          title: selectedSource.title,
          body: selectedSource.body,
          status: selectedStatus,
          createdAt: selectedSource.createdAt,
        }
      : null;
  const DetailPanel =
    selectedDraft?.status === "processing"
      ? WorkingDraftDetailPanel
      : IdleDraftDetailPanel;

  // 이 페이지의 주축 데이터(초안 목록)가 뜨기 전엔 헤더까지 다 숨기고 워터마크만 —
  // 로딩이 끝나는 순간 헤더 포함 실제 페이지로 곧장 전환된다.
  if (pendingQuery.isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-surface-card">
        <LoadingWatermark />
      </main>
    );
  }

  return (
    <main className="flex flex-1 bg-surface-card">
      <div className="flex min-h-0 flex-1 flex-col">
        <NavigationBar>
          <h1 className="text-sm font-medium text-fg-primary">
            {t("intake.drafts_title")}
          </h1>
        </NavigationBar>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-8">
            <DraftList
              onSelectSource={setSelectedSourceId}
              editedDraftId={editedDraftId}
            />
          </div>
        </div>
      </div>

      {selectedDraft && (
        <SidePanel onClose={() => setSelectedSourceId(null)}>
          <DetailPanel
            key={selectedDraft.sourceId}
            sourceId={selectedDraft.sourceId}
            spaceId={selectedDraft.spaceId}
            title={selectedDraft.title}
            body={selectedDraft.body}
            status={selectedDraft.status}
            createdAt={selectedDraft.createdAt}
            onClose={() => setSelectedSourceId(null)}
            onBodyDirtyChange={(dirty) =>
              setEditedDraftId(dirty ? selectedDraft.sourceId : null)
            }
          />
        </SidePanel>
      )}
    </main>
  );
}
