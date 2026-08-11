import { z } from "zod";

import type { Digest, DigestType } from "@nema-io/shared";
import { DIGEST_BODY_SCHEMAS_BY_TYPE } from "@nema-io/shared";

// =============================================================
// Digest 생성 — 원문을 사람이 읽기 좋은 정리본 후보로 (LLM 1콜, 동기).
// docs/blueprints/first-product/engine/organizing.md 1.5의 스코프를 좁힌 버전
// (킥오프 문서 "LLM 프롬프트" 절 초안 그대로) — 주제·레퍼런스·태그는 다음 순서.
//
// 구조화 출력 스키마는 유형별 배열 5개다(판별 유니언 아님, PM 지침). 배열 이름이
// 곧 유형이라 유형 오분류가 스키마 자체에서 구조적으로 막히고, 주된 칸을 required로
// 걸어 "그 유형인데 그 유형의 근거가 없는" 다이제스트를 막는다. 대신 required가
// 결함을 옮기지 않도록(빈 칸→지어낸 칸) Splitting 규칙 5·6이 "채울 수 없으면
// 만들지 않는다"를 명시한다.
// =============================================================

export const DIGEST_GENERATION_SYSTEM_PROMPT = `You turn a user's raw note into digests — cleaned-up write-ups of the judgments
the note contains. The raw note is preserved elsewhere untouched; your digests
are what the user will actually read later.

## Digest types

Each digest captures ONE judgment, grouped by type into five separate lists.

- "decisions": something was decided.
  choice (what was decided) is required.
  situation (what had to be decided), reason (why), tradeoff (what was accepted
  as a cost), alternatives (considered but rejected) are optional.
- "pendings": something is not yet decided.
  question (what remains undecided) is required.
  background (why this question arose), branches (candidate directions),
  resolutionCondition (what would settle it) are optional.
- "learnings": something was found out.
  finding (what was confirmed) is required.
  evidence (what supports it) is optional.
- "ideas": something was thought up.
  concept (the idea itself) is required.
  background (why it came up), branches (derived possibilities) are optional.
- "assumptions": something is treated as true without verification.
  assumption (what is assumed) is required.
  evidence (why it is believed, may be weak), impact (what changes if it turns
  out false), verificationCondition (what would settle it) are optional.

"pendings" vs "ideas": pending is something that has to be settled but is not
yet; idea is something raised that is not yet up for decision.

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
5. Each type's required field is what makes it that type. If the note doesn't
   give you that field, do not produce a digest of that type — never invent
   content to force one into existence.
6. When a judgment's type is ambiguous, do not produce a digest for it. A wrong
   type is worse than a missing one.
7. A note with no judgment at all (greetings, filler, pure diary) yields empty
   arrays. Do not force digests out of noise.

## Writing

8. Fill only what the note says — including the required field. Never invent,
   never pad. When the note does not state an optional field (a reason, a
   tradeoff, evidence), set it to null.
9. "title" is a short headline stating what the judgment is. It must be
   understandable without reading the rest of the fields.
10. Write in the same language as the note.

## Output

JSON object with five arrays, one per type. Each item's title and required field
come first; the rest are optional — set to null when the note doesn't state them.

{ "decisions":   [{ "title", "choice", "situation", "reason", "tradeoff", "alternatives" }],
  "pendings":    [{ "title", "question", "background", "branches", "resolutionCondition" }],
  "learnings":   [{ "title", "finding", "evidence" }],
  "ideas":       [{ "title", "concept", "background", "branches" }],
  "assumptions": [{ "title", "assumption", "evidence", "impact", "verificationCondition" }] }

tradeoff, alternatives, branches are arrays of strings; the rest are strings.`;

export function buildDigestGenerationMessage(body: string): string {
  return `<note>${body}</note>`;
}

const DecisionSchema = z.object({
  title: z.string().trim().min(1),
  choice: z.string().min(1),
  situation: z.string().nullable(),
  reason: z.string().nullable(),
  tradeoff: z.array(z.string()).nullable(),
  alternatives: z.array(z.string()).nullable(),
});

const PendingSchema = z.object({
  title: z.string().trim().min(1),
  question: z.string().min(1),
  background: z.string().nullable(),
  branches: z.array(z.string()).nullable(),
  resolutionCondition: z.string().nullable(),
});

const LearningSchema = z.object({
  title: z.string().trim().min(1),
  finding: z.string().min(1),
  evidence: z.string().nullable(),
});

const IdeaSchema = z.object({
  title: z.string().trim().min(1),
  concept: z.string().min(1),
  background: z.string().nullable(),
  branches: z.array(z.string()).nullable(),
});

const AssumptionSchema = z.object({
  title: z.string().trim().min(1),
  assumption: z.string().min(1),
  evidence: z.string().nullable(),
  impact: z.string().nullable(),
  verificationCondition: z.string().nullable(),
});

// 빈 배열 허용 — 판단이 없는 글(인사말·잡담)은 다이제스트가 안 나오는 게 정의.
export const DigestGenerationSchema = z.object({
  decisions: z.array(DecisionSchema),
  pendings: z.array(PendingSchema),
  learnings: z.array(LearningSchema),
  ideas: z.array(IdeaSchema),
  assumptions: z.array(AssumptionSchema),
});

export type GeneratedDigests = z.infer<typeof DigestGenerationSchema>;

// 배열 키 → DB 저장 type 값. 배열 이름 자체가 유형이라, 평평한 스키마 시절
// normalizeDigest가 하던 "이 칸들 중 어디까지가 이 유형 것인가" 판단이 필요 없다.
const DIGEST_TYPE_BY_ARRAY_KEY = {
  decisions: "decision",
  pendings: "pending",
  learnings: "learning",
  ideas: "idea",
  assumptions: "assumption",
} as const satisfies Record<keyof GeneratedDigests, DigestType>;

// 5개 배열을 저장용 {type, title, body} 목록 하나로 편다. 비어 있는(=null이거나
// LLM이 규칙 8을 어기고 낸 빈 문자열/배열) 보조 칸은 뺀다. 필수 칸은 스키마가
// 이미 비지 않음을 보장하므로 별도 처리가 필요 없다.
export function flattenGeneratedDigests(
  generated: GeneratedDigests,
): Array<Pick<Digest, "type" | "title" | "body">> {
  const result: Array<Pick<Digest, "type" | "title" | "body">> = [];

  const entries = Object.entries(DIGEST_TYPE_BY_ARRAY_KEY) as Array<
    [keyof GeneratedDigests, DigestType]
  >;
  for (const [arrayKey, type] of entries) {
    for (const generatedItem of generated[arrayKey]) {
      const { title, ...rest } = generatedItem;
      const candidate = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => !isEmpty(value)),
      );
      const body = DIGEST_BODY_SCHEMAS_BY_TYPE[type].parse(candidate);
      const digest = { type, title, body };
      result.push(digest as Pick<Digest, "type" | "title" | "body">);
    }
  }

  return result;
}

function isEmpty(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}
