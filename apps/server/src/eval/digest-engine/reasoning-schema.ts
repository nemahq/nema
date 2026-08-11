import { z } from "zod";

import {
  AssumptionSchema,
  buildDigestGenerationSystemPrompt,
  DecisionSchema,
  IdeaSchema,
  LearningSchema,
  PendingSchema,
} from "@server/prompts/digest-generation";

// human-review 전용 변형 — 프로덕션 스키마(digest-generation.ts)는 안 건드린다.
// 유니언을 피한 것과 같은 이유로 프로덕션 스키마는 얕게 유지해야 하는데, 항목마다
// reasoning을 더하는 건 정반대 방향이라 실사용자는 그 비용(토큰·지연·복잡도)을
// 안 낸다. reasoning은 정답이 아니라 어디를 더 볼지 좁혀주는 힌트로만 쓴다 — 특히
// 싼 모델은 사후 설명이 실제 추론과 다를 수 있다.

const REASONING_FIELD = z.string().min(1);

const ReasoningDecisionSchema = DecisionSchema.extend({
  reasoning: REASONING_FIELD,
});
const ReasoningPendingSchema = PendingSchema.extend({
  reasoning: REASONING_FIELD,
});
const ReasoningLearningSchema = LearningSchema.extend({
  reasoning: REASONING_FIELD,
});
const ReasoningIdeaSchema = IdeaSchema.extend({ reasoning: REASONING_FIELD });
const ReasoningAssumptionSchema = AssumptionSchema.extend({
  reasoning: REASONING_FIELD,
});

// 포함된 항목의 reasoning만으로는 "왜 아예 안 만들었는지"를 못 본다 — 안 만든
// 항목엔 reasoning을 붙일 자리 자체가 없다. omitted는 그 반대쪽을 묻는다.
const OmittedSchema = z.object({
  note: z.string().min(1),
  reason: z.string().min(1),
});

export const ReasoningDigestGenerationSchema = z.object({
  decisions: z.array(ReasoningDecisionSchema),
  pendings: z.array(ReasoningPendingSchema),
  learnings: z.array(ReasoningLearningSchema),
  ideas: z.array(ReasoningIdeaSchema),
  assumptions: z.array(ReasoningAssumptionSchema),
  omitted: z.array(OmittedSchema),
});

export type ReasoningGeneratedDigests = z.infer<
  typeof ReasoningDigestGenerationSchema
>;

const REASONING_INSTRUCTION = `

## Reasoning (eval only)

Every item also carries a "reasoning" field: one or two sentences on why you
classified it as this type and included it. Cite what in the note drove the
call, especially when the type or inclusion was a close call.

Also report, in a top-level "omitted" array, every judgment-like passage in the
note that you considered but did NOT turn into a digest — one entry per passage,
with a short quote or paraphrase ("note") and why you left it out ("reason":
merged into another digest, type was too ambiguous, judged too minor, or
whatever the real reason was). This list exists only to check your splitting
decisions; it does not affect what gets saved.`;

export function buildReasoningSystemPrompt(contentLanguage?: string): string {
  return (
    buildDigestGenerationSystemPrompt(contentLanguage) + REASONING_INSTRUCTION
  );
}
