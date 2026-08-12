import { z } from "zod";

import type { ContentLanguage, DigestType } from "@nema-io/shared";
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

// 프롬프트에는 코드값("ko"/"en")이 아니라 LLM이 바로 읽을 수 있는 언어 이름을
// 넘긴다. "원문과 같은 언어로 맞춰라"는 지시는 신뢰도가 낮았다(한국어 원문에
// 영어로 출력된 사례를 케이스 1 재실행에서 확인) — profiles.content_language의
// 명시값을 그대로 이름으로 바꿔 넘기는 지금 방식을 유지한다.
const CONTENT_LANGUAGE_NAMES: Record<ContentLanguage, string> = {
  ko: "Korean",
  en: "English",
};

export function buildDigestGenerationSystemPrompt(
  contentLanguage: ContentLanguage,
): string {
  return `You turn a user's raw note into digests — cleaned-up write-ups of the judgments
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

"learnings" vs "ideas": a learning is something the note itself treats as
confirmed. A hedged, tentative reflection ("might be a sign", "maybe there's
something there") is an idea, not a learning, no matter how insightful it
reads — hedging in the note's own words is your signal, not your call to make.

"assumptions" vs "ideas": an assumption is a belief about what IS true — a
fact, a cause, a state of the world — held without verification, even a
fresh guess counts. An idea is a proposal for what to DO — a new action or
approach not yet decided on. Test: does it answer "what's going on, why" (an
assumption) or "what could we try" (an idea)? A guess at why something
happened is an assumption even if nothing else in the note depends on it yet.

## Splitting

1. One digest = one judgment. If a note mixes judgment types — a decision here,
   an open question there — split them into separate digests. This applies
   regardless of where in the note a judgment sits. A note's own section
   headers (background, premises, notes) group ideas for the note's author,
   not for you — judge each sentence on its own; a judgment stated under a
   "background" or "premise" heading is still a judgment and still gets its
   own digest.
2. There is no cap. Produce every judgment the note contains. Do not force splits,
   and do not merge judgments to keep the count down. A note that screens several
   candidates and rejects some before settling on one has a SEPARATE decision for
   each rejected candidate (each has its own reason), plus one for whatever was
   picked — do not treat a rejection as already implied by the decision that names
   what was chosen just because they happened in the same screening pass. The same
   goes for a decision that immediately follows another one in conversation — a
   note where two people confirm a decision and then, in the very next exchange,
   settle a second, separate question (a new workflow, who owns what going
   forward) still owes that second decision its own digest. Coming right after
   another decision, on a related topic, does not make it part of that decision.
3. When the note revisits the SAME question and the answer changes, produce one
   digest holding the final conclusion — how it got there belongs in reason or
   alternatives, not in separate digests. Answers to DIFFERENT questions are not
   revisions; make one digest each.
4. A question that the note itself answers is not "pending" — it belongs in the
   resulting decision's "situation" (or the learning that settled it). Only make a
   "pending" digest when the note leaves it unanswered. This rule only blocks
   fabricating a "pending" for something already settled — it does not mean the
   settled judgment itself goes unrecorded; a note that reaches a conclusion still
   owes that conclusion its own "decision" digest per rules 1-3.
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
   tradeoff, evidence), set it to null. Cleaning up wording for readability is
   fine; changing what it claims is not. Five specific traps: (a) do not
   raise the note's own confidence — if the note hedges ("might", "maybe", "일
   수도"), keep that hedge instead of writing it as settled; (b) do not add
   evaluative words the note itself didn't use ("effective", "valid",
   "better") — describing what someone did is not the same as claiming it
   worked; (c) "tradeoff" is what the choice actually costs — a real
   sacrifice, not the choice or the reason restated in different words. Test:
   if the sentence just repeats what was picked or why, it isn't a tradeoff;
   (d) list an "alternative" only when the note shows it would have had a
   real gain over the choice made — not just that it was mentioned or
   briefly considered. If the note doesn't show why an option would have
   been worth picking, it isn't a real alternative; leave it out. "Keep
   doing what we were already doing" only counts when the note shows a
   specific gain from staying put, not as a default every decision
   technically has; (e) "evidence" only exists when
   the note shows a real fact backing up the finding — restating the finding
   is not evidence for it. When none of (c)/(d)/(e) apply, leave the field
   null rather than filling it with something technically true but empty.
9. "title" is a short headline stating what the judgment is. It must be
   understandable without reading the rest of the fields.
10. Write in ${CONTENT_LANGUAGE_NAMES[contentLanguage]}, regardless of what language the note itself uses.

## Output

JSON object with five arrays, one per type. Each item's title and required field
come first; the rest are optional — set to null when the note doesn't state them.
Within each array, order items by where their judgment first appears in the note.

{ "decisions":   [{ "title", "choice", "situation", "reason", "tradeoff", "alternatives" }],
  "pendings":    [{ "title", "question", "background", "branches", "resolutionCondition" }],
  "learnings":   [{ "title", "finding", "evidence" }],
  "ideas":       [{ "title", "concept", "background", "branches" }],
  "assumptions": [{ "title", "assumption", "evidence", "impact", "verificationCondition" }] }

tradeoff, alternatives, branches are arrays of strings; the rest are strings.`;
}

export function buildDigestGenerationMessage(body: string): string {
  return `<note>${body}</note>`;
}

// eval의 reasoning 변형(apps/server/src/eval/digest-engine/reasoning-schema.ts)이
// .extend()로 이어 쓸 수 있게 export한다 — 그쪽 스키마를 여기서 손으로 복제하면
// 이 파일이 바뀔 때마다 조용히 어긋난다.
export const DecisionSchema = z.object({
  title: z.string().trim().min(1),
  choice: z.string().trim().min(1),
  situation: z.string().trim().nullable(),
  reason: z.string().trim().nullable(),
  tradeoff: z.array(z.string()).nullable(),
  alternatives: z.array(z.string()).nullable(),
});

export const PendingSchema = z.object({
  title: z.string().trim().min(1),
  question: z.string().trim().min(1),
  background: z.string().trim().nullable(),
  branches: z.array(z.string()).nullable(),
  resolutionCondition: z.string().trim().nullable(),
});

export const LearningSchema = z.object({
  title: z.string().trim().min(1),
  finding: z.string().trim().min(1),
  evidence: z.string().trim().nullable(),
});

export const IdeaSchema = z.object({
  title: z.string().trim().min(1),
  concept: z.string().trim().min(1),
  background: z.string().trim().nullable(),
  branches: z.array(z.string()).nullable(),
});

export const AssumptionSchema = z.object({
  title: z.string().trim().min(1),
  assumption: z.string().trim().min(1),
  evidence: z.string().trim().nullable(),
  impact: z.string().trim().nullable(),
  verificationCondition: z.string().trim().nullable(),
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

// type과 body가 같은 유형끼리 짝지어지도록 판별 유니언으로 둔다. Pick<Digest, ...>는
// discriminated union을 인덱스로 접근하면 body가 다섯 유형 전부의 합집합으로
// 뭉개져서 type과 무관해진다 — DIGEST_BODY_SCHEMAS_BY_TYPE[type]을 다른 유형으로
// 바꿔치기해도 tsc가 못 잡는 사례를 실측으로 확인했다.
type GeneratedDigestItem = {
  [T in DigestType]: {
    type: T;
    title: string;
    body: z.infer<(typeof DIGEST_BODY_SCHEMAS_BY_TYPE)[T]>;
  };
}[DigestType];

// 5개 배열을 저장용 {type, title, body} 목록 하나로 편다. 비어 있는(=null이거나
// LLM이 규칙 8을 어기고 낸 빈 문자열/배열) 보조 칸은 뺀다. 필수 칸은 스키마가
// 이미 비지 않음을 보장하므로 별도 처리가 필요 없다.
export function flattenGeneratedDigests(
  generated: GeneratedDigests,
): GeneratedDigestItem[] {
  const result: GeneratedDigestItem[] = [];

  const entries = Object.entries(DIGEST_TYPE_BY_ARRAY_KEY) as Array<
    [keyof GeneratedDigests, DigestType]
  >;
  for (const [arrayKey, type] of entries) {
    for (const generatedItem of generated[arrayKey]) {
      const { title, ...rest } = generatedItem;
      const candidate = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => !isEmpty(value)),
      );
      result.push(toGeneratedDigestItem({ type, title, candidate }));
    }
  }

  return result;
}

// switch로 분기해야 각 분기 안에서 type이 리터럴로 좁혀지고, 그에 따라
// DIGEST_BODY_SCHEMAS_BY_TYPE[해당 유형]의 반환 타입도 같이 좁혀진다 — 제네릭
// 인덱싱(구버전처럼 DIGEST_BODY_SCHEMAS_BY_TYPE[type] 하나로 처리)으로는 이
// 상관관계가 안 생겨서 캐스팅 없이는 통과 못 한다.
function toGeneratedDigestItem(args: {
  type: DigestType;
  title: string;
  candidate: Record<string, unknown>;
}): GeneratedDigestItem {
  const { type, title, candidate } = args;
  switch (type) {
    case "decision":
      return {
        type,
        title,
        body: DIGEST_BODY_SCHEMAS_BY_TYPE.decision.parse(candidate),
      };
    case "pending":
      return {
        type,
        title,
        body: DIGEST_BODY_SCHEMAS_BY_TYPE.pending.parse(candidate),
      };
    case "learning":
      return {
        type,
        title,
        body: DIGEST_BODY_SCHEMAS_BY_TYPE.learning.parse(candidate),
      };
    case "idea":
      return {
        type,
        title,
        body: DIGEST_BODY_SCHEMAS_BY_TYPE.idea.parse(candidate),
      };
    case "assumption":
      return {
        type,
        title,
        body: DIGEST_BODY_SCHEMAS_BY_TYPE.assumption.parse(candidate),
      };
  }
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
