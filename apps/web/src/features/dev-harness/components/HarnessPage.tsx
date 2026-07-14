import { useState } from "react";

import { cn } from "@nema-io/weave";

import { HistoryPanel } from "@web/features/dev-harness/components/HistoryPanel";
import { ModelSettingsPanel } from "@web/features/dev-harness/components/ModelSettingsPanel";
import { RelationsPanel } from "@web/features/dev-harness/components/RelationsPanel";
import { ReviewPanel } from "@web/features/dev-harness/components/ReviewPanel";
import { TopicsPanel } from "@web/features/dev-harness/components/TopicsPanel";
import { WorkTab } from "@web/features/dev-harness/components/WorkTab";

const TABS = [
  { id: "work", label: "작업" },
  { id: "relations", label: "관계" },
  { id: "review", label: "검토함" },
  { id: "history", label: "이력" },
  { id: "models", label: "모델" },
  { id: "topics", label: "주제" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// 내부 테스트 조종석 (NEM-125·153) — 제품 화면이 아니다.
// 진술 엔진(넣기·검색)과 관계·개입 백엔드(검토함·이력)를 실입력으로 만져보며 보정하는 입구.
export function HarnessPage() {
  const [tab, setTab] = useState<TabId>("work");

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface-card">
      <nav className="flex gap-1 border-b border-border/60 px-2 py-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              tab === entry.id
                ? "bg-surface-raised font-semibold text-fg-primary"
                : "text-fg-tertiary hover:text-fg-secondary",
            )}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        {tab === "work" && <WorkTab />}
        {tab === "relations" && <RelationsPanel />}
        {tab === "review" && <ReviewPanel />}
        {tab === "history" && <HistoryPanel />}
        {tab === "models" && <ModelSettingsPanel />}
        {tab === "topics" && <TopicsPanel />}
      </div>
    </main>
  );
}
