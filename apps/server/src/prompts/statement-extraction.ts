import { z } from "zod";

import { ExtractedDeadlineSchema } from "@server/temporal/deadline";

// =============================================================
// 추출 — source body를 진술로 쪼개기·종류·확신도 (LLM 1콜)
//
// 절단 원칙 4개(ingestion-design 3장)가 뼈대. 세부 문구·경계값은
// 테스트 하니스에서 실제 데이터로 보정한다.
// 출력 순서 = 원문 등장 순서 계약 — index는 호출자가 배열 위치에서 파생.
// =============================================================

export const STATEMENT_EXTRACTION_SYSTEM_PROMPT = `You break a user's raw note into statements — the atomic units of their thinking.

A statement is a single unit of meaning: one decision, one belief, or one question. Statements are stored and searched individually, so each must stand on its own.

## Statement types

- "claim": something the user holds to be the case — a fact, decision, opinion, observation, or intended action.
- "question": something the user is asking or wondering about — including open issues awaiting a decision, even when not phrased as a question ("need to think more about whether to adopt X" → "should we adopt X?").

## Confidence (claims only)

- "certain": stated as settled — a decision made, a fact asserted, definitive wording.
- "guess": hedged or tentative — the user signals they are not fully sure. Beyond explicit hedges ("maybe", "I think", "it seems", "아마", "~인 것 같다"), this includes softer markers of possibility or leaning rather than settled fact: "~해 보인다"/"~인 듯하다" (it seems), "가능성이 있다"/"여지가 있다" (there is a chance / room to), "~고 본다"/"~로 보인다" (a view taken, not yet verified). When the wording reports a possibility, impression, or opinion rather than a made decision or an asserted fact, mark it guess — do not harden it to certain.
- Set confidence ONLY on claims. For questions it must be null.

## Cutting rules

1. One statement = one "why". If one sentence carries two decisions, split it into two statements. If three sentences elaborate a single decision, merge them into one statement. Cut by units of meaning, not by sentences.
   - Split test: if two pieces of information could each be searched for on its own, or could each become outdated on its own, they are separate statements. A decision and its reason are two statements ("we chose X because Y" → "we chose X" + "the reason for choosing X is Y"). Likewise a status and its expected date, and a conjunction of parallel facts ("A and B are both common requests" → one statement for A, one for B).
   - The reason form ("the reason for X is Y") is for decisions the note explains — at most one linked reason statement per decision. Other facts that merely sit near the decision stay plain fact statements; do not recast every nearby fact as another reason.
   - When you split, carry the full subject into every piece ("the cause of the API refactoring delay is...", never "the cause of the delay is...") — each piece must still read on its own.
   - Never drop a reason. If the note says why something was decided or believed, that "why" must survive as its own statement.
   - Do NOT split a task from its deadline or owner — "finish the draft by Wednesday" is ONE claim. The deadline qualifies the task; it is not separate information.
2. Self-contained. Resolve pronouns and omissions using the note's context so each statement reads on its own. Never leave "it", "that idea", "him" unresolved if the note tells you what they refer to. A finding tied to a specific person or item — a customer's overall reaction, or a named/positional subject's preference or position ("the third customer is satisfied", "김 대리 wants a fast launch") — is itself a statement worth keeping: resolve the subject and extract it, do not discard it as a passing impression.
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
4. "다음 주 화요일까지 마이그레이션 계획을 짜야 한다" — claim, certain (deadline stays with the task; deadline = next Tuesday → { boundary: "by", anchorKind: "weekday", weekday: "tue", scope: "next", grain/offset/date: null })
5. "모니터링 대시보드 연동이 필요하다" — claim, certain (conjunction split…)
6. "알림 연동이 필요하다" — claim, certain (…into parallel statements)
7. "배포 롤백 정책은 어떻게 할 것인가?" — question (an open issue, recast as the question it is)

"오늘 날씨 좋네" produces nothing.

## Deadlines

A statement may carry a deadline stated IN its content ("금요일까지 끝내기", "이번 주 안에 마감"). Set "deadline" to a token when the content says when the task or obligation is due; otherwise null. Most statements have no deadline → null. The deadline belongs to the task itself — do not invent one from when the note was written.

A deadline token: { "boundary", "anchorKind", "grain", "offset", "weekday", "scope", "date" }

- "boundary": "by" — due by a point ("금요일까지"). "within" — due within a period ("이번 주 안에").
- "anchorKind" picks which remaining fields are set; the rest MUST be null:
  - "relative": "grain" ("day" | "week" | "month" | "quarter") + "offset" (this=0, next=+1, last=-1, the day after the note=+2).
  - "weekday": "weekday" ("mon".."sun") + "scope" ("this" | "next").
  - "absolute": "date" ("YYYY-MM-DD"). When the content omits the year, resolve it against <today> (the note's own date), picking the nearest sensible occurrence.

## Surrounding context (present only for long notes)

A long note may be processed in consecutive segments. When the message includes <context_before> or <context_after>, they are the raw text neighboring the <note> segment, attached read-only:

- Use them to resolve pronouns and omitted subjects ("that approach" → the approach named in context), and to see decisions that continue or reverse across the segment boundary.
- Extract statements ONLY from <note>. Text that appears only in context must never become a statement — the neighboring segment's own extraction covers it.

## Output

- JSON object: { "statements": [{ "content": string, "type": "claim" | "question", "confidence": "certain" | "guess" | null, "deadline": <token> | null }] }
- Order statements by where they appear in the note (first appearance wins).
- Write each statement's content in the same language as the note.
- Content must contain only the statement text — no surrounding XML markup.`;

const ExtractedStatementSchema = z.object({
  // trim — 공백뿐인 진술이 DB·임베딩까지 흘러가지 않게 (source body 검증과 정합)
  content: z.string().trim().min(1),
  type: z.enum(["claim", "question"]),
  confidence: z.enum(["certain", "guess"]).nullable(),
  // 내용 속 기한("금요일까지")을 구조화 토큰으로. 워커가 작성 시점·존 기준으로 풀어
  // due_date를 채운다 (temporal-query-design 7장). 기한 없으면 null.
  deadline: ExtractedDeadlineSchema.nullable(),
  // Digest의 어느 칸에서 나왔나(situation/choice/reason/tradeoff… — FE
  // review/constants.ts의 DIGEST_BODY_FIELDS key와 정확히 같은 문자열). 이 스키마는
  // 원문 직접 추출(이 파일의 프롬프트, 현재 eval 전용 죽은 경로)과도 공유되는데, 그
  // 경로엔 애초에 "칸" 개념이 없어 항상 null로 나온다 — 두 경로가 같은 출력 계약을
  // 쓴다는 상단 주석의 관례를 그대로 따른다.
  sourceField: z.string().nullable(),
  // tradeoff/alternatives/branches처럼 배열 칸일 때만 채운다(0-based, 몇 번째
  // 항목인지). situation/choice/reason 같은 단일 칸이면 null.
  sourceFieldIndex: z.number().int().nullable(),
});

export type ExtractedStatement = z.infer<typeof ExtractedStatementSchema>;

// 빈 배열 허용 — 진술이 안 나오는 텍스트(인사말·추임새)는 추출되지 않는 게 정의
export const StatementExtractionSchema = z.object({
  statements: z.array(ExtractedStatementSchema),
});

// 문맥(before/after)은 분할 경로(초장문)에서만 붙는다 — 읽기 전용, 규칙은 시스템 프롬프트의
// Surrounding context 절. todayIsoDate는 절대 날짜의 연도 보정 기준 = 글의 작성일.
export function buildStatementExtractionMessage(
  body: string,
  options?: {
    todayIsoDate?: string;
    before?: string | null;
    after?: string | null;
  },
): string {
  const parts: string[] = [];
  if (options?.todayIsoDate) {
    parts.push(`<today>${options.todayIsoDate}</today>`);
  }
  if (options?.before) {
    parts.push(`<context_before>${options.before}</context_before>`);
  }
  parts.push(`<note>${body}</note>`);
  if (options?.after) {
    parts.push(`<context_after>${options.after}</context_after>`);
  }
  return parts.join("\n");
}
