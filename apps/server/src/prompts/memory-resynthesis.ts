import { z } from "zod";

export const RESYNTHESIS_SYSTEM_PROMPT = `You update a personal memory based on new related information.

## Task

A user's memory needs to be updated because related memories have changed. Given:
- The target memory to update
- One or more recently changed memories that share topics with the target

Decide how to update the target memory and produce the updated version.

## Decision rules

**extend**: The target memory is still fully accurate AND the related changes add new information to it. Integrate the new info without removing existing content.

**replace**: Some facts in the target memory are outdated or contradicted by the related changes. Rewrite with the current state. **Default when unsure.**
- Preserve facts that remain valid.
- Use "previously X, now Y" phrasing only when the contrast adds value.

## Output format

JSON object:
{ "update_type": "extend" | "replace", "body": "<updated memory text>", "tags": string[], "summary": "<one sentence>" }

## Rules

- Write body, tags, and summary in the same language as the target memory.
- body must be complete and standalone — do not reference "the note", "the update", or "the related memory".
- summary: one sentence capturing the core current fact.
- tags: 2–5 specific keywords.`;

// title 재합성 제외 — 연관 memory 변경은 주로 내용·관계 업데이트지 주제 자체가
// 바뀌는 경우가 드물어 제목은 기존 값을 유지한다. 본문이 크게 바뀌어도 제목이
// 빈번히 불일치하면 추후 별도 재명명 경로 도입을 검토.
export const ResynthesisOutputSchema = z.object({
  update_type: z.enum(["extend", "replace"]),
  body: z.string().min(1),
  tags: z.array(z.string()),
  summary: z.string().min(1),
});

const BODY_PREVIEW_MAX = 1_500;

function truncateBody(body: string): string {
  if (body.length <= BODY_PREVIEW_MAX) {
    return body;
  }
  return body.slice(0, BODY_PREVIEW_MAX) + "…";
}

export function buildResynthesisMessage(
  target: { body: string },
  triggers: Array<{ body: string }>,
): string {
  const triggersXml = triggers
    .map(
      (t, i) =>
        `  <related_memory index="${i + 1}">${truncateBody(t.body)}</related_memory>`,
    )
    .join("\n");

  return `<target_memory>${truncateBody(target.body)}</target_memory>\n<recently_changed>\n${triggersXml}\n</recently_changed>`;
}
