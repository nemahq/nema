// 해설 측정의 공유 코어 — fixture를 제품 Evidence로 싸 제품과 동일한 해설 입력 문자열을 만든다.
// run-narration-markers(마커 누락률)와 run-model-comparison(가성비)이 함께 쓴다.
// run-narration-markers는 import 시 main()이 실행돼 직접 못 빌려오므로 여기로 뺐다.

import type { Evidence } from "@server/services/assemble-evidence";
import { buildNarrationUserMessage } from "@server/services/narration";
import type { SearchedStatement } from "@server/services/statement-search";

import { type NarrationFixture } from "./narration-marker-seed";

// 시드는 결정적이라 진짜 시각이 불필요 — 고정 타임스탬프로 박는다.
const FIXTURE_TIMESTAMP = "2026-01-01T00:00:00.000Z";

// 진술을 한 source 묶음으로 싼다 — 흘림은 진술 수·관계 체인이 유발하지 묶음 분할이 아니라서.
function toEvidence(fixture: NarrationFixture): Evidence {
  const statements: SearchedStatement[] = fixture.statements.map((s) => ({
    id: s.id,
    content: s.content,
    type: s.type,
    confidence: s.type === "claim" ? (s.confidence ?? "certain") : null,
    createdAt: FIXTURE_TIMESTAMP,
    score: 1,
    ...(s.supersededBy ? { supersededBy: s.supersededBy } : {}),
    ...(s.conflictsWith ? { conflictsWith: s.conflictsWith } : {}),
    ...(s.resolvedBy ? { resolvedBy: s.resolvedBy } : {}),
  }));
  return {
    groups: [
      {
        key: {
          kind: "source",
          sourceId: `src-${fixture.name}`,
          sourceCreatedAt: FIXTURE_TIMESTAMP,
        },
        totalStatementCount: statements.length,
        statements,
      },
    ],
    relatedStatements: (fixture.related ?? []).map((r) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      createdAt: FIXTURE_TIMESTAMP,
      sourceIds: [],
    })),
  };
}

export function buildNarrationMessage(fixture: NarrationFixture): string {
  return buildNarrationUserMessage(fixture.query, toEvidence(fixture));
}
