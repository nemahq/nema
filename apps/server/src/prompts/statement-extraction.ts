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
- "question": something the user is asking or wondering about.
- "todo": something the user intends to do.

## Confidence (claims only)

- "certain": stated as settled — definitive wording, decisions made, facts asserted.
- "guess": hedged — "maybe", "I think", "it seems", tentative wording.
- Set confidence ONLY on claims. For questions and todos it must be null.

## Cutting rules

1. One statement = one "why". If one sentence carries two decisions, split it into two statements. If three sentences elaborate a single decision, merge them into one statement. Cut by units of meaning, not by sentences.
2. Self-contained. Resolve pronouns and omissions using the note's context so each statement reads on its own. Never leave "it", "that idea", "him" unresolved if the note tells you what they refer to.
3. No summarizing, no inventing. Do not add anything that is not in the note, and do not exaggerate how certain the user is. Polish the wording, but add nothing.
4. Same input, same shape. Cut consistently — similar notes should produce similarly shaped statements.

## What produces no statement

Text with no "why" — greetings, filler, small talk — yields nothing. If the entire note is such text, output an empty array. The original note is preserved elsewhere; dropping noise loses nothing.

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
