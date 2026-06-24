import { useState } from "react";

import { Button } from "@nema-io/weave";

import { IngestPanel } from "@web/features/dev-harness/components/IngestPanel";
import { NarrationPanel } from "@web/features/dev-harness/components/NarrationPanel";

// 오른쪽은 해설 단일 뷰 — 질의를 받아 근거 위 산문을 낸다. 검색 묶음은 해설의 근거 섹션이 겸한다.
export function WorkTab() {
  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  function handleSubmit() {
    const trimmed = queryInput.trim();
    if (trimmed) {
      setSubmittedQuery(trimmed);
    }
  }

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col border-r border-border/60">
        <IngestPanel />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-2 border-b border-border/60 p-4">
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSubmit();
              }
            }}
            placeholder="자연어로 질문 — 예: 결제는 왜 토스로 정했지?"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-strong"
          />
          <Button
            size="xs"
            className="self-center"
            onClick={handleSubmit}
            disabled={!queryInput.trim()}
          >
            묻기
          </Button>
        </div>
        <NarrationPanel query={submittedQuery} />
      </div>
    </div>
  );
}
