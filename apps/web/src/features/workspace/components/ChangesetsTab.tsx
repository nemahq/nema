import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { ChangesPanel, type ChangesSubTab } from "@web/features/review";

interface ChangesetsTabProps {
  spacePublicId: string;
  spaceId: string;
  subTab: ChangesSubTab;
  onSubTabChange: (subTab: ChangesSubTab) => void;
}

// 목록이 터져도 헤더·컴포저·탭은 남아야 해서 탭 콘텐츠에만 경계를 두른다.
export function ChangesetsTab({
  spacePublicId,
  spaceId,
  subTab,
  onSubTabChange,
}: ChangesetsTabProps) {
  return (
    <ErrorBoundary
      boundaryName="changeset-panel"
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
