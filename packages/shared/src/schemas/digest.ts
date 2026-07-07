import { z } from "zod";

// DB CHECK(chk_digest_body_type)가 인정하는 판별자 값의 SSOT (07-modeling DigestBody).
export const DIGEST_TYPES = [
  "decision",
  "pending",
  "learning",
  "idea",
  "assumption",
] as const;

export const DigestTypeSchema = z.enum(DIGEST_TYPES);
export type DigestType = z.infer<typeof DigestTypeSchema>;

// 본문 필드는 전부 optional — 원문에 없으면 비워두고 지어내지 않는다(07-modeling).
const DecisionBodySchema = z.object({
  type: z.literal("decision"),
  situation: z.string().optional(),
  choice: z.string().optional(),
  reason: z.string().optional(),
  tradeoff: z.array(z.string()).optional(),
  alternatives: z.array(z.string()).optional(),
});

const PendingBodySchema = z.object({
  type: z.literal("pending"),
  question: z.string().optional(),
  background: z.string().optional(),
  branches: z.array(z.string()).optional(),
  resolutionCondition: z.string().optional(),
});

const LearningBodySchema = z.object({
  type: z.literal("learning"),
  finding: z.string().optional(),
  evidence: z.string().optional(),
});

const IdeaBodySchema = z.object({
  type: z.literal("idea"),
  concept: z.string().optional(),
  background: z.string().optional(),
  branches: z.array(z.string()).optional(),
});

const AssumptionBodySchema = z.object({
  type: z.literal("assumption"),
  assumption: z.string().optional(),
  evidence: z.string().optional(),
  impact: z.string().optional(),
  verificationCondition: z.string().optional(),
});

export const DigestBodySchema = z.discriminatedUnion("type", [
  DecisionBodySchema,
  PendingBodySchema,
  LearningBodySchema,
  IdeaBodySchema,
  AssumptionBodySchema,
]);

export type DigestBody = z.infer<typeof DigestBodySchema>;

export const DIGEST_TITLE_MAX_LENGTH = 200;
export const DIGEST_DESCRIPTION_MAX_LENGTH = 500;
