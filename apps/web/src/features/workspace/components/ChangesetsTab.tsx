import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { ChangesPanel, type ChangesSubTab } from "@web/features/review";

interface ChangesetsTabProps {
  spacePublicId: string;
  spaceId: string;
  subTab: ChangesSubTab;
  onSubTabChange: (subTab: ChangesSubTab) => void;
}

// 목록의 로딩·실패는 ChangesetList가 자체 경계로 처리한다 — 여기 경계가 잡는 건
// 서브탭 chrome 자체가 렌더 중 터지는 경우뿐이다. 도달 경로는 드물지만 지우면 그
// 크래시가 화면 전체로 올라가 Space 오버뷰가 통째로 날아간다.
export function ChangesetsTab({
  spacePublicId,
  spaceId,
  subTab,
  onSubTabChange,
}: ChangesetsTabProps) {
  return (
    <ErrorBoundary
      boundaryName="changes-panel"
      fallbackRender={(fallbackProps) => (
        <SectionErrorFallback {...fallbackProps} />
      )}
    >
      <ChangesPanel
        spacePublicId={spacePublicId}
        spaceId={spaceId}
        subTab={subTab}
        onSubTabChange={onSubTabChange}
      />
    </ErrorBoundary>
  );
}
