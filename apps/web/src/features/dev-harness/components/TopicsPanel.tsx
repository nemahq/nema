import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { TopicRow } from "@web/features/dev-harness/components/TopicRow";
import { useTopicListSuspenseQuery } from "@web/features/dev-harness/hooks/useTopicListQuery";
import { getErrorMessage } from "@web/lib/getErrorMessage";

function TopicsPanelContent() {
  const [{ topics }] = useTopicListSuspenseQuery();

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">
        주제 ({topics.length})
      </h2>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {topics.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            아직 주제 없음 — 인제스천 확정으로 만들어진다(수동 생성 없음)
          </p>
        )}
        {topics.map((topic) => (
          <TopicRow
            key={topic.id}
            id={topic.id}
            title={topic.title}
            status={topic.status}
          />
        ))}
      </div>
    </section>
  );
}

// 내부 테스트 조종석 전용 — Topic 이름변경/아카이브/되살리기 백엔드 확인용 최소 UI.
export function TopicsPanel() {
  return (
    <ErrorBoundary
      boundaryName="dev-harness-topics"
      fallbackRender={({ error }) => (
        <p className="p-4 text-xs text-status-error">
          주제 불러오기 실패 — {getErrorMessage(error)}
        </p>
      )}
    >
      <Suspense
        fallback={<p className="p-4 text-xs text-fg-tertiary">불러오는 중…</p>}
      >
        <TopicsPanelContent />
      </Suspense>
    </ErrorBoundary>
  );
}
