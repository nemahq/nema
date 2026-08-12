import { useEffect } from "react";

import { SidePanel } from "@web/components/ui/SidePanel";
// 형제인 DraftList가 같은 쿼리를 이미 채워둔 뒤에야 이 패널이 열리므로 여기서
// 서스펜드할 일이 없다 — 만약 서스펜드하면 공용 <Outlet> 경계까지 올라가 이미
// 떠 있는 목록째로 워터마크에 덮인다.
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
  const missing = !source || !status;

  // 정리 완료·삭제·리뷰 전환으로 목록에서 빠지면 URL의 sourceId가 가리킬 대상이
  // 없다. 렌더만 걸러내면 죽은 ?source=가 URL에 남아 새로고침해도, 링크를 다시
  // 열어도 계속 무반응이다(로컬 state였을 땐 새로고침이면 저절로 풀렸다).
  // 사라진 실체를 URL에도 반영해 걷어낸다.
  useEffect(
    function clearMissingSource() {
      if (missing) {
        onClose();
      }
    },
    [missing, onClose],
  );

  if (missing) {
    return null;
  }

  return (
    <SidePanel boundaryName="draft-detail" onClose={onClose}>
      {status === "processing" ? (
        <WorkingDraftDetailPanel
          key={source.sourceId}
          sourceId={source.sourceId}
          spaceId={source.spaceId}
          title={source.title}
          body={source.body}
          createdAt={source.createdAt}
          digestionStartedAt={source.digestionStartedAt}
          onClose={onClose}
        />
      ) : (
        <IdleDraftDetailPanel
          key={source.sourceId}
          sourceId={source.sourceId}
          spaceId={source.spaceId}
          title={source.title}
          body={source.body}
          status={status}
          inputChangedSinceDigestion={source.inputChangedSinceDigestion}
          onClose={onClose}
        />
      )}
    </SidePanel>
  );
}
