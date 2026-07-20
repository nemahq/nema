import type { ReactNode } from "react";

import { NavigationBar } from "@web/components/layout/NavigationBar";

interface ChangesetDetailLayoutSkeletonProps {
  children?: ReactNode;
}

// ChangesetDetailLayout과 같은 골격을 Space 이름·제목 없이 낸다 — 데이터가 오기 전엔
// 브레드크럼을 채울 수 없어서다. children을 주면 본문 자리에 스켈레톤을 얹는다.
export function ChangesetDetailLayoutSkeleton({
  children,
}: ChangesetDetailLayoutSkeletonProps) {
  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <NavigationBar />
      <div data-main-scroll-area className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
          {children}
        </div>
      </div>
    </main>
  );
}
