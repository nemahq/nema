import type { ReactNode } from "react";
import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useProfileSuspenseQuery } from "@web/features/profile";

import { OnboardingModal } from "./OnboardingModal";

// 프로필 조회가 실패해도(네트워크 순단 등) children은 그대로 렌더한다 — 온보딩
// 여부를 못 정했다고 앱 전체를 막을 이유는 없다. 그 경우 모달은 띄우지 않는다:
// "완료 여부 불명"인 채로 강제 모달을 띄우면 이미 온보딩을 끝낸 사용자에게도
// 뜬다 — 안 뜨는 쪽이 상대적으로 안전한 실패다.
function OnboardingModalGate() {
  const [profile] = useProfileSuspenseQuery();
  return profile ? null : <OnboardingModal />;
}

interface OnboardingGateProps {
  children: ReactNode;
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  return (
    <>
      {children}
      <ErrorBoundary boundaryName="onboarding" fallback={null}>
        <Suspense fallback={null}>
          <OnboardingModalGate />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
