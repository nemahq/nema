import { z } from "zod";

// =============================================================
// coarse scoping — 질의를 공간 주제로 라우팅한다 (auto-scoping-design §3).
//
// 구조화 콜(시간·의미)과 별도다(병렬). 한 콜에 합치면 주제 정확도가 깎인다(측정 #19:
// 합치면 묻힌 사실 0.8→0.4). 독립 프롬프트라야 #17에서 잰 라우팅 품질이 그대로 산다.
// =============================================================

export const COARSE_SCOPING_SYSTEM_PROMPT = `You route a user's question to the topics whose notes most likely contain the answer. You get a list of topics, each with an id. Return the ids of the topics that could answer the question.

- Optimize for recall, not precision. If a topic could plausibly hold the answer, include it. A later step searches inside the picked topics, so extra picks are cheap, but missing the right topic loses the answer entirely.
- If the question spans several topics, pick all of them.
- If the question is too vague to place, or matches no topic, return an empty list. A later step then falls back to searching everything.
- Return only ids that appear in the list.`;

export const CoarseScopingRawSchema = z.object({
  topicIds: z.array(z.string()),
});

export interface CoarseScopingTopic {
  id: string;
  label: string;
}

export function buildCoarseScopingMessage(args: {
  query: string;
  topics: CoarseScopingTopic[];
}): string {
  const block = args.topics.map((t) => `- [${t.id}] ${t.label}`).join("\n");
  return `<topics>\n${block}\n</topics>\n<question>${args.query}</question>`;
}
