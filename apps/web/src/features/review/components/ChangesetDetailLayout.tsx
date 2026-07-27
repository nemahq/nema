import type { ReactNode } from "react";

import { ChangesetDetailNavigationBar } from "./ChangesetDetailNavigationBar";

interface ChangesetDetailLayoutProps {
  title: string;
  children: ReactNode;
  // ingestion 화면(자동 저장 상태 표시)만 채운다 — 다른 changeset 상태 화면은 이 슬롯
  // 자체를 넘기지 않으면 그만이라, navbar chrome을 공유해도 저장 상태 트리거는 새지 않는다.
  navBarRightContent?: ReactNode;
}

// changeset 타입과 무관하게 상세 화면이 공유하는 껍데기 — 타입별 화면은 본문만 채운다.
export function ChangesetDetailLayout({
  title,
  children,
  navBarRightContent,
}: ChangesetDetailLayoutProps) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card">
      <ChangesetDetailNavigationBar
        title={title}
        rightContent={navBarRightContent}
      />
      <div data-main-scroll-area className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
          {children}
        </div>
      </div>
    </main>
  );
}
