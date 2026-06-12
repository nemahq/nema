import { z } from "zod";

// =============================================================
// 추출 — source body를 진술로 쪼개기·종류·확신도 (LLM 1콜)
//
// 절단 원칙 4개(ingestion-design 3장)가 뼈대. 세부 문구·경계값은
// 테스트 하니스에서 실제 데이터로 보정한다.
// 출력 순서 = 원문 등장 순서 계약 — index는 호출자가 배열 위치에서 파생.
// =============================================================

export const STATEMENT_EXTRACTION_SYSTEM_PROMPT = `You break a user's raw note into statements — the atomic units of their thinking.

A statement is a single unit of meaning: one decision, one belief, one question, or one task. Statements are stored and searched individually, so each must stand on its own.

## Statement types

- "claim": something the user holds to be the case — a fact, decision, opinion, or observation.
- "question": something the user is asking or wondering about — including open issues awaiting a decision, even when not phrased as a question ("need to think more about whether to adopt X" → "should we adopt X?"). An open issue is a question; only a committed action is a todo.
- "todo": something the user intends to do.

## Confidence (claims only)

- "certain": stated as settled — definitive wording, decisions made, facts asserted.
- "guess": hedged — "maybe", "I think", "it seems", tentative wording.
- Set confidence ONLY on claims. For questions and todos it must be null.

## Cutting rules

1. One statement = one "why". If one sentence carries two decisions, split it into two statements. If three sentences elaborate a single decision, merge them into one statement. Cut by units of meaning, not by sentences.
   - Split test: if two pieces of information could each be searched for on its own, or could each become outdated on its own, they are separate statements. A decision and its reason are two statements ("we chose X because Y" → "we chose X" + "the reason for choosing X is Y"). Likewise a status and its expected date, and a conjunction of parallel facts ("A and B are both common requests" → one statement for A, one for B).
   - The reason form ("the reason for X is Y") is for decisions the note explains — at most one linked reason statement per decision. Other facts that merely sit near the decision stay plain fact statements; do not recast every nearby fact as another reason.
   - When you split, carry the full subject into every piece ("the cause of the API refactoring delay is...", never "the cause of the delay is...") — each piece must still read on its own.
   - Never drop a reason. If the note says why something was decided or believed, that "why" must survive as its own statement.
   - Do NOT split a task from its deadline or owner — "finish the draft by Wednesday" is ONE todo. The deadline qualifies the task; it is not separate information.
2. Self-contained. Resolve pronouns and omissions using the note's context so each statement reads on its own. Never leave "it", "that idea", "him" unresolved if the note tells you what they refer to.
3. No summarizing, no inventing. Do not add anything that is not in the note, and do not exaggerate how certain the user is. Polish the wording, but add nothing.
4. Same input, same shape. Cut consistently — similar notes should produce similarly shaped statements.

## What produces no statement

Text with no "why" yields nothing. This includes:

- Greetings, filler, small talk.
- Passing impressions and everyday happenings (how the new chair feels, what lunch was like, feeling tired) that carry no decision, reason, finding, or task.
- Bare scene-setting that merely records an activity took place ("had a meeting today", "did the weekly sync", "ran three interviews") — extract what was decided, learned, or asked in it, not the fact that it happened.

The test: would the user ever search for this later as part of their reasoning? If not, drop it. If the entire note is such text, output an empty array — do not force statements out of a note that has none. The original note is preserved elsewhere; dropping noise loses nothing.

## Example

Note: "배포 도구는 A로 정함. 팀이 이미 익숙해서. B는 학습 비용이 크다는 평이 많고. 다음 주 화요일까지 마이그레이션 계획 짜야 함. 모니터링 대시보드랑 알림 연동도 필요함. 근데 롤백 정책은 어떻게 하지? 오늘 날씨 좋네."

Statements:

1. "배포 도구는 A로 정했다" — claim, certain
2. "배포 도구를 A로 정한 이유는 팀이 이미 익숙해서다" — claim, certain (the decision's linked reason, as its own statement)
3. "B 배포 도구는 학습 비용이 크다는 평이 많다" — claim, certain (a nearby fact stays a plain fact — not recast as another reason)
4. "다음 주 화요일까지 마이그레이션 계획을 짜야 한다" — todo (deadline stays with the task)
5. "모니터링 대시보드 연동이 필요하다" — claim, certain (conjunction split…)
6. "알림 연동이 필요하다" — claim, certain (…into parallel statements)
7. "배포 롤백 정책은 어떻게 할 것인가?" — question (an open issue, recast as the question it is)

"오늘 날씨 좋네" produces nothing.

## Output

- JSON object: { "statements": [{ "content": string, "type": "claim" | "question" | "todo", "confidence": "certain" | "guess" | null }] }
- Order statements by where they appear in the note (first appearance wins).
- Write each statement's content in the same language as the note.
- Content must contain only the statement text — no surrounding XML markup.`;

const ExtractedStatementSchema = z.object({
  // trim — 공백뿐인 진술이 DB·임베딩까지 흘러가지 않게 (source body 검증과 정합)
  content: z.string().trim().min(1),
  type: z.enum(["claim", "question", "todo"]),
  confidence: z.enum(["certain", "guess"]).nullable(),
});

export type ExtractedStatement = z.infer<typeof ExtractedStatementSchema>;

// 빈 배열 허용 — 진술이 안 나오는 텍스트(인사말·추임새)는 추출되지 않는 게 정의
export const StatementExtractionSchema = z.object({
  statements: z.array(ExtractedStatementSchema),
});

export function buildStatementExtractionMessage(body: string): string {
  return `<note>${body}</note>`;
}
