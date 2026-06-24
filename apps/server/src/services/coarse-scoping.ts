import * as Sentry from "@sentry/node";

import type { Providers } from "@server/infra/providers";
import {
  buildCoarseScopingMessage,
  COARSE_SCOPING_SYSTEM_PROMPT,
  CoarseScopingRawSchema,
  type CoarseScopingTopic,
} from "@server/prompts/coarse-scoping";

// 질의 → 관련 주제 id. 빈 배열이면 scope 없음(전역으로 강등). 주제가 없으면 LLM 콜도 생략.
// LLM이 목록 밖 id를 지어낼 수 있어 실재하는 주제로만 거른다.
export async function selectScopeTopics(args: {
  providers: Providers;
  query: string;
  topics: CoarseScopingTopic[];
}): Promise<string[]> {
  if (args.topics.length === 0) {
    return [];
  }
  const raw = await args.providers.llm
    .forTask("selectScopeTopics")
    .generateStructured({
      schema: CoarseScopingRawSchema,
      schemaName: "coarse_scoping",
      systemPrompt: COARSE_SCOPING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildCoarseScopingMessage({
            query: args.query,
            topics: args.topics,
          }),
        },
      ],
    });
  const valid = new Set(args.topics.map((t) => t.id));
  const picked = [...new Set(raw.topicIds.filter((id) => valid.has(id)))];
  // LLM이 id를 냈는데 전부 목록 밖(환각)이면 빈 scope가 돼 "의도된 전역 강등"과 구분이 안 된다 —
  // 예외가 안 나 조용히 묻히는 퇴행이라, rate 경보를 걸 수 있게 별도 신호를 남긴다.
  if (raw.topicIds.length > 0 && picked.length === 0) {
    Sentry.captureMessage("coarse scoping returned only unknown topic ids", {
      level: "warning",
      tags: { component: "coarse-scoping", outcome: "all-invalid-ids" },
      extra: { returned: raw.topicIds, validCount: args.topics.length },
    });
  }
  return picked;
}
