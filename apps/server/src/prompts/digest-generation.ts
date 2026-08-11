import { z } from "zod";

import type { Digest, DigestType } from "@nema-io/shared";
import { DIGEST_BODY_SCHEMAS_BY_TYPE, DIGEST_TYPES } from "@nema-io/shared";

// =============================================================
// Digest 생성 — 원문을 사람이 읽기 좋은 정리본 후보로 (LLM 1콜, 동기).
// docs/blueprints/first-product/engine/organizing.md 1.5의 스코프를 좁힌 버전
// (킥오프 문서 "LLM 프롬프트" 절 초안 그대로) — 주제·레퍼런스·태그는 다음 순서.
// =============================================================

export const DIGEST_GENERATION_SYSTEM_PROMPT = `You turn a user's raw note into digests — cleaned-up write-ups of the judgments
the note contains. The raw note is preserved elsewhere untouched; your digests
are what the user will actually read later.

## Digest types

Each digest captures ONE judgment.

- "decision": something was decided.
  situation (what had to be decided), choice (what was decided), reason (why),
  tradeoff (what was accepted as a cost), alternatives (considered but rejected)
- "pending": something is not yet decided.
  question (what remains undecided), background (why this question arose),
  branches (candidate directions), resolutionCondition (what would settle it)
- "learning": something was found out.
  finding (what was confirmed), evidence (what supports it)
- "idea": something was thought up.
  concept (the idea itself), background (why it came up), branches (derived possibilities)
- "assumption": something is treated as true without verification.
  assumption (what is assumed), evidence (why it is believed, may be weak),
  impact (what changes if it turns out false), verificationCondition (what would settle it)

"pending" vs "idea": pending is something that has to be settled but is not yet;
idea is something raised that is not yet up for decision.

## Splitting

1. One digest = one judgment. If a note mixes judgment types — a decision here,
   an open question there — split them into separate digests.
2. There is no cap. Produce every judgment the note contains. Do not force splits,
   and do not merge judgments to keep the count down.
3. When the note revisits the SAME question and the answer changes, produce one
   digest holding the final conclusion — how it got there belongs in reason or
   alternatives, not in separate digests. Answers to DIFFERENT questions are not
   revisions; make one digest each.
4. A question that the note itself answers is not "pending" — it belongs in the
   resulting decision's "situation" (or the learning that settled it). Only make a
   "pending" digest when the note leaves it unanswered.
5. A note with no judgment at all (greetings, filler, pure diary) yields an empty
   array. Do not force digests out of noise.

## Writing

6. Fill only what the note says. Every body field is optional: when the note does
   not state a reason, a tradeoff, or evidence, set it to null. Never invent,
   never pad. Fields that do not belong to the digest's type MUST be null.
7. "title" is a short headline stating what the judgment is. It must be
   understandable without reading the body.
8. Write in the same language as the note.

## Output

JSON object:
{ "digests": [{ "type", "title",
    "situation", "choice", "reason", "tradeoff", "alternatives",
    "question", "background", "branches", "resolutionCondition",
    "finding", "evidence", "concept",
    "assumption", "impact", "verificationCondition" }] }

tradeoff, alternatives, branches are arrays of strings; the rest are strings.
Order digests by where their judgment first appears in the note.`;

export function buildDigestGenerationMessage(body: string): string {
  return `<note>${body}</note>`;
}

// 구조화 출력이 판별 유니언을 잘 못 다뤄 평평하게 받는다(전 필드 nullable) — 저장 시
// normalizeDigest가 유형에 맞는 칸만 골라 접는다(legacy/apps/server/src/prompts/
// digest-generation.ts 끝 주석과 같은 근거).
const GeneratedDigestSchema = z.object({
  type: z.enum(DIGEST_TYPES),
  title: z.string().trim().min(1),
  situation: z.string().nullable(),
  choice: z.string().nullable(),
  reason: z.string().nullable(),
  tradeoff: z.array(z.string()).nullable(),
  alternatives: z.array(z.string()).nullable(),
  question: z.string().nullable(),
  background: z.string().nullable(),
  branches: z.array(z.string()).nullable(),
  resolutionCondition: z.string().nullable(),
  finding: z.string().nullable(),
  evidence: z.string().nullable(),
  concept: z.string().nullable(),
  assumption: z.string().nullable(),
  impact: z.string().nullable(),
  verificationCondition: z.string().nullable(),
});

export type GeneratedDigest = z.infer<typeof GeneratedDigestSchema>;

// 빈 배열 허용 — 판단이 없는 글(인사말·잡담)은 Digest가 안 나오는 게 정의.
export const DigestGenerationSchema = z.object({
  digests: z.array(GeneratedDigestSchema),
});

// 유형별 칸만 골라 body로 접는다. null인 칸은 뺀다(값이 없는 것과 "빈 문자열"을
// 구분하고, 저장되는 jsonb를 그 유형이 실제로 채운 칸만큼만 가볍게 유지한다).
export function normalizeDigest(
  generated: GeneratedDigest,
): Pick<Digest, "type" | "title" | "body"> {
  const type: DigestType = generated.type;
  const bodySchema = DIGEST_BODY_SCHEMAS_BY_TYPE[type];
  const candidate = Object.fromEntries(
    Object.entries(generated).filter(([, value]) => value !== null),
  );
  const body = bodySchema.parse(candidate);
  const normalized = { type, title: generated.title, body };
  return normalized as Pick<Digest, "type" | "title" | "body">;
}
