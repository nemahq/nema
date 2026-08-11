import { z } from "zod";

import type { Digest } from "@nema-io/shared";

// =============================================================
// Statement 생성 — 다이제스트의 주된 칸을 혼자 읽히는 문장으로 (LLM 1콜, 다이제스트당).
// docs/blueprints/first-product/engine/linking.md 2.2의 스코프를 좁힌 버전
// (킥오프 문서 "프롬프트 지시" 절 그대로) — 후보 검색·거르기·판정·관계·임베딩은 다음 순서.
//
// 주된 칸이 말하는 것만 문장으로 만든다. 다른 칸은 문장을 이해하는 데만 쓰고 내용이
// 새어 들어오면 안 된다 — 안 그러면 이유·트레이드오프가 섞여 들어가 뒤 슬라이스의
// 판정("선택이 같은가")을 못 묻는다. 원문은 안 싣는다 — 다이제스트만 넘긴다.
// =============================================================

// 콘텐츠 언어 설정(profiles.content_language — 설계 의도는
// docs/blueprints/first-product/surface-inventory.md 참고)이 아직 없어 지금은
// 고정한다. digest-generation.ts와 같은 자리·같은 값 — 다이제스트가 이미 이
// 언어로 쓰여 있으므로 진술도 같은 언어여야 서로 어긋나지 않는다.
const DEFAULT_CONTENT_LANGUAGE = "Korean";

export function buildStatementGenerationSystemPrompt(
  contentLanguage: string = DEFAULT_CONTENT_LANGUAGE,
): string {
  return `You are given ONE digest — a cleaned-up write-up of a single judgment already
extracted from a user's note. Turn its primary field into one self-contained
sentence: a statement.

## Digest types

- "decision": the primary field is "choice" — what was decided. The statement
  asserts the choice and closes as a completed decision — a settled fact,
  nothing left open.
- "pending": the primary field is "question" — what remains undecided. The
  statement asserts the question and closes as an unresolved question — do
  not hint at an answer.
- "learning": the primary field is "finding" — what was confirmed. The
  statement asserts the finding and closes as an established fact — no
  supporting clause.
- "idea": the primary field is "concept" — what was thought up. The statement
  asserts the concept and closes as a possibility, not a settled fact — do
  not overstate certainty.
- "assumption": the primary field is "assumption" — what is assumed true
  without verification. The statement asserts the assumption and closes as a
  stated assumption — no justification, no verification-condition clause.

These shapes constrain what the sentence claims, not its literal wording —
phrase the closing naturally in the target language. A sentence that opens a
"because", "in order to", "which shows", or similar clause is about to leak
another field — none of the shapes above open such a clause.

## What to write

1. Say ONLY what the primary field states. The digest's other fields (reason,
   tradeoff, evidence, background, situation, alternatives, branches,
   resolutionCondition, impact, verificationCondition) exist to help you
   understand and phrase the sentence — never let their content leak into it.

   Example (decision, primary field: "excluded candidate X"):
   - BAD:  "Candidate X was excluded because [reason]." — the reason leaked in.
   - GOOD: "Candidate X was excluded as a candidate." — states only the choice.

2. Write a sentence that stands on its own: resolve pronouns and implicit
   references using the digest's title, so someone reading only the
   statement — with no other context — understands what it says. Prefer the
   title for this over other fields — it is already written to stand alone.
   Do not lift narrative-specific phrasing from situation/background (e.g.
   "the remaining two candidates") that itself needs outside context to
   parse.
3. Do not summarize the whole digest and do not add anything the digest
   doesn't say.
4. Write in ${contentLanguage}.
5. Keep the grammatical register consistent across every statement, no matter
   the digest type — do not let formality or sentence-final form vary by
   type (e.g. a polite/formal ending for some types and a plain/declarative
   ending for others, in a language that distinguishes them). Statements are
   records, not messages to a person: when the target language has a plain,
   declarative register, use it for all five types.

## Output

JSON object: { "statement": string }`;
}

export function buildStatementGenerationMessage(
  digest: Pick<Digest, "type" | "title" | "body">,
): string {
  return `<digest type="${digest.type}">${JSON.stringify({ title: digest.title, ...digest.body })}</digest>`;
}

export const StatementGenerationSchema = z.object({
  statement: z.string().trim().min(1),
});
export type GeneratedStatement = z.infer<typeof StatementGenerationSchema>;
