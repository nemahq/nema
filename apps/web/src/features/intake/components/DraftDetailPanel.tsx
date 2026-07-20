import { SidePanel } from "@web/components/ui/SidePanel";
// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { usePendingSourceListSuspenseQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { draftStatus } from "@web/features/intake/utils";

import { IdleDraftDetailPanel } from "./IdleDraftDetailPanel";
import { WorkingDraftDetailPanel } from "./WorkingDraftDetailPanel";

interface DraftDetailPanelProps {
  sourceId: string;
  onClose: () => void;
}

// 선택된 초안의 스냅샷을 들지 않고 매번 최신 쿼리 데이터에서 다시 찾는다 — 목록은
// Realtime invalidate로 계속 갱신되는데 클릭 시점 스냅샷을 붙들면 열어둔 패널이
// 그 갱신(타이틀 도착, processing→완료/실패 전환)을 영영 못 본다.
export function DraftDetailPanel({ sourceId, onClose }: DraftDetailPanelProps) {
  const [pendingSources] = usePendingSourceListSuspenseQuery();
  const source = pendingSources.items.find(
    (item) => item.sourceId === sourceId,
  );
  const status = source ? draftStatus(source) : null;

  // 삭제·리뷰 전환으로 목록에서 빠지면 URL에 남은 sourceId가 가리킬 대상이 없다.
  if (!source || !status) {
    return null;
  }

  return (
    <SidePanel boundaryName="draft-detail" onClose={onClose}>
      {status === "processing" ? (
        <WorkingDraftDetailPanel
          sourceId={source.sourceId}
          spaceId={source.spaceId}
          title={source.title}
          body={source.body}
          createdAt={source.createdAt}
          lastDigestionAttempt={source.lastDigestionAttempt}
          onClose={onClose}
        />
      ) : (
        <IdleDraftDetailPanel
          sourceId={source.sourceId}
          spaceId={source.spaceId}
          title={source.title}
          body={source.body}
          status={status}
          onClose={onClose}
        />
      )}
    </SidePanel>
  );
}
