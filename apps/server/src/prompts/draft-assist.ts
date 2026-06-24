// 한 방 어시스턴트 프롬프트 — 거친 말뭉치를 깔끔한 초안으로 정제하면서
// 제목·주제까지 한 번에 제안한다(구조화 출력). 외부 입구(Claude Code)가 하는 일을
// 앱 입구에서 nema가 대칭으로 수행하는 자리. 본문 정제 규칙은 drafting 프롬프트와 같은 결.

import { z } from "zod";

import { BODY_REFINEMENT_RULES } from "./drafting-rules";

export const DraftAssistOutputSchema = z.object({
  // 초안을 목록에서 알아볼 짧은 제목.
  title: z.string(),
  // 정제된 본문(drafting 규칙과 동일: 감정 제거, 정도 표현 보존, 내용 추가 금지).
  body: z.string(),
  // 주제 라벨(줄기). 기존 주제 재사용 우선, 평소 1개, 명확히 다주제일 때만 여러 개.
  topics: z.array(z.string()),
});

export const DRAFT_ASSIST_SYSTEM_PROMPT = `You refine one raw blob of user input into a clean draft and propose a title and topic labels. Output structured fields: title, body, topics.

<instructions>
## body — refine the raw input
${BODY_REFINEMENT_RULES}

## title — a short handle
- One short line that lets the user recognize this draft in a list. Same language as the input. No trailing punctuation.

## topics — topic labels (the "stems" this belongs to)
- Reuse an existing topic from <existing_topics> when one fits — match it verbatim. Only invent a new label when none fit.
- Be conservative: usually exactly ONE topic. Propose more than one only when the input clearly spans distinct subjects.
- If you genuinely cannot tell, return an empty list. Do NOT force a wrong label — an empty list (left untagged) is better than a misleading one.
- Each label is short (a few words), in the same language as the input.
</instructions>`;

export function buildDraftAssistMessage(
  blob: string,
  existingTopics: string[],
): string {
  const topicsBlock =
    existingTopics.length > 0
      ? existingTopics.map((name) => `- ${name}`).join("\n")
      : "(none yet)";
  return `<existing_topics>\n${topicsBlock}\n</existing_topics>\n\n<input>${blob}</input>`;
}
