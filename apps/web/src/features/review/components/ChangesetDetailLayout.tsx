import type { ReactNode } from "react";

import { ChangesetDetailNavigationBar } from "./ChangesetDetailNavigationBar";

interface ChangesetDetailLayoutProps {
  title: string;
  children: ReactNode;
}

// changeset 타입과 무관하게 상세 화면이 공유하는 껍데기 — 타입별 화면은 본문만 채운다.
export function ChangesetDetailLayout({
  title,
  children,
}: ChangesetDetailLayoutProps) {
  return (
    <main className="flex min-h-0 flex-1 flex-col bg-surface-card">
      <ChangesetDetailNavigationBar title={title} />
      <div data-main-scroll-area className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
          {children}
        </div>
      </div>
    </main>
  );
}
