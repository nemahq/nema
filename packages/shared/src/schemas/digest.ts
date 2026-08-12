import { z } from "zod";

// DB enum digest_type의 SSOT. 다섯 유형이 각각 어떤 판단을 담는지는
// docs/blueprints/first-product/engine/organizing.md 1.5 참고.
export const DIGEST_TYPES = [
  "decision",
  "pending",
  "learning",
  "idea",
  "assumption",
] as const;

export const DigestTypeSchema = z.enum(DIGEST_TYPES);
export type DigestType = z.infer<typeof DigestTypeSchema>;

// 유형별 본문 칸 — 원문에 없으면 그 칸을 통째로 뺀다(값을 지어내지 않는다).
// `type`은 DB에서 별도 컬럼이라 body 안에는 안 들어간다.
const DecisionBodySchema = z.object({
  situation: z.string().optional(),
  choice: z.string().optional(),
  reason: z.string().optional(),
  tradeoff: z.array(z.string()).optional(),
  alternatives: z.array(z.string()).optional(),
});

const PendingBodySchema = z.object({
  question: z.string().optional(),
  background: z.string().optional(),
  branches: z.array(z.string()).optional(),
  resolutionCondition: z.string().optional(),
});

const LearningBodySchema = z.object({
  finding: z.string().optional(),
  evidence: z.string().optional(),
});

const IdeaBodySchema = z.object({
  concept: z.string().optional(),
  background: z.string().optional(),
  branches: z.array(z.string()).optional(),
});

const AssumptionBodySchema = z.object({
  assumption: z.string().optional(),
  evidence: z.string().optional(),
  impact: z.string().optional(),
  verificationCondition: z.string().optional(),
});

// 유형 → 본문 스키마. normalize(서버)와 표시(클라이언트) 양쪽이 한 표를 본다.
export const DIGEST_BODY_SCHEMAS_BY_TYPE = {
  decision: DecisionBodySchema,
  pending: PendingBodySchema,
  learning: LearningBodySchema,
  idea: IdeaBodySchema,
  assumption: AssumptionBodySchema,
} as const satisfies Record<DigestType, z.ZodType>;

// id·type·title·body를 한 덩어리로 — type이 body 모양을 결정하므로 판별 유니언으로
// 묶어야 소비처(FE)가 type만 보고 body 필드를 좁혀 쓸 수 있다.
export const DigestSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid(),
    type: z.literal("decision"),
    title: z.string(),
    body: DecisionBodySchema,
    createdAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("pending"),
    title: z.string(),
    body: PendingBodySchema,
    createdAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("learning"),
    title: z.string(),
    body: LearningBodySchema,
    createdAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("idea"),
    title: z.string(),
    body: IdeaBodySchema,
    createdAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("assumption"),
    title: z.string(),
    body: AssumptionBodySchema,
    createdAt: z.string().datetime({ offset: true }),
  }),
]);

export type Digest = z.infer<typeof DigestSchema>;
