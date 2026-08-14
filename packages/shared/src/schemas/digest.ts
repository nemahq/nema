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

// 이름이 서로 다른 이유 — 미결의 갈래는 아직 어느 쪽도 이길 수 있어 찬반을 함께
// 담는 argument가 맞고, 결정의 대안은 이미 진 길이라 rejectionReason이 맞다.
const PendingBranchSchema = z.object({
  option: z.string(),
  argument: z.string().optional(),
});

const DecisionAlternativeSchema = z.object({
  option: z.string(),
  rejectionReason: z.string().optional(),
});

// 유형별 본문 칸 — 원문에 없으면 그 칸을 통째로 뺀다(값을 지어내지 않는다).
// `type`은 DB에서 별도 컬럼이라 body 안에는 안 들어간다.
const DecisionBodySchema = z.object({
  situation: z.string().optional(),
  choice: z.string().optional(),
  reason: z.string().optional(),
  tradeoff: z.array(z.string()).optional(),
  alternatives: z.array(DecisionAlternativeSchema).optional(),
});

const PendingBodySchema = z.object({
  question: z.string().optional(),
  background: z.string().optional(),
  branches: z.array(PendingBranchSchema).optional(),
  resolutionCondition: z.string().optional(),
});

const LearningBodySchema = z.object({
  finding: z.string().optional(),
  evidence: z.string().optional(),
});

const IdeaBodySchema = z.object({
  concept: z.string().optional(),
  background: z.string().optional(),
  // pending의 같은 이름과 달리 문자열로 둔다 — 여기 branches는 갈림길이 아니라
  // 파생 후보라 이름 옆에 찬반을 달 자리가 아니다.
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

// 꺼내기 입력 — 뜻으로 찾는 질의 하나와 반환 개수 상한.
export const DIGEST_SEARCH_DEFAULT_LIMIT = 10;
export const DIGEST_SEARCH_MAX_LIMIT = 50;

export const DigestSearchInputSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().positive().max(DIGEST_SEARCH_MAX_LIMIT).optional(),
});
export type DigestSearchInput = z.infer<typeof DigestSearchInputSchema>;

// Digest에 소속 원문 id와 벡터 유사도 점수를 얹은 모양 — 꺼내기 응답 하나당 항목.
// 원문은 안 싣는다. 필요하면 sourceId로 source.get을 따로 부른다.
export const DigestSearchResultSchema = z.intersection(
  DigestSchema,
  z.object({ sourceId: z.string().uuid(), score: z.number() }),
);
export type DigestSearchResult = z.infer<typeof DigestSearchResultSchema>;

// 목록 화면 전용 얇은 모양 — body 없이 id·type·title만 싣는다(목록에는 본문을
// 안 싣는다, 상세는 따로 조회). type은 화면이 아이콘/라벨을 고르는 데 쓴다.
export const DigestListItemSchema = z.object({
  id: z.string().uuid(),
  type: DigestTypeSchema,
  title: z.string(),
});
export type DigestListItem = z.infer<typeof DigestListItemSchema>;

// 삭제(가림) 공용 입력 — "이 다이제스트를" 말고는 인자가 없다.
export const DigestActionInputSchema = z.object({
  digestId: z.string().uuid(),
});
export type DigestActionInput = z.infer<typeof DigestActionInputSchema>;

export const DigestDeleteResultSchema = z.object({
  // 이미 가려진(또는 남의) digestId로 불러도 에러는 아니다 — source.delete와 같은 관행.
  success: z.boolean(),
});
export type DigestDeleteResult = z.infer<typeof DigestDeleteResultSchema>;
