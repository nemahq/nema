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
  return [...new Set(raw.topicIds.filter((id) => valid.has(id)))];
}
