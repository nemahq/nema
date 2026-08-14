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

// DB enum digest_relation_type의 SSOT. 이번 슬라이스는 지지·약화 둘뿐이다 —
// 중복·충돌·해소는 아무것도 접지 않는 이 둘과 달리 사람의 리뷰가 필요해 다음 순서다
// (docs/blueprints/first-product/engine/linking.md 2.3).
export const DIGEST_RELATION_TYPES = ["support", "weaken"] as const;

export const DigestRelationTypeSchema = z.enum(DIGEST_RELATION_TYPES);
export type DigestRelationType = z.infer<typeof DigestRelationTypeSchema>;

// 관계의 두 끝. from이 하는 쪽(지지·약화하는 쪽), to가 받는 쪽 — 지지·약화에서
// 받는 쪽은 늘 결정이다(linking.md 2.7). digest_relations의 컬럼명과 같다.
export type RelationEnd = "from" | "to";

// 관계는 한 방향으로 저장되지만 관련 목록에는 양쪽 다 뜬다(linking.md 2.3).
// 같은 한 줄이라도 어느 다이제스트에 붙느냐에 따라 문장이 뒤집혀서, 응답에는
// 방향까지 접어 넣은 값을 싣는다 — "support"만 실어 보내면 받은 쪽이 "이걸 지지한다"와
// "이게 지지받는다"를 못 가르고, 해설이 근거 방향을 거꾸로 말하게 된다.
const DIGEST_RELATION_PERSPECTIVES = [
  "supports",
  "supported_by",
  "weakens",
  "weakened_by",
] as const;

export const DigestRelationPerspectiveSchema = z.enum(
  DIGEST_RELATION_PERSPECTIVES,
);
export type DigestRelationPerspective = z.infer<
  typeof DigestRelationPerspectiveSchema
>;

// 저장된 관계 종류 × 이 줄이 붙는 끝 → 응답에 실리는 값. satisfies로 묶어둬서
// 관계 종류가 늘면 컴파일러가 빠진 줄을 짚는다.
export const RELATION_PERSPECTIVE_BY_END = {
  support: { from: "supports", to: "supported_by" },
  weaken: { from: "weakens", to: "weakened_by" },
} as const satisfies Record<
  DigestRelationType,
  Record<RelationEnd, DigestRelationPerspective>
>;

// 관계 한 줄 — 상대 다이제스트를 통째로 싣지 않고 제목까지만 싣는다. 정리 프롬프트
// 규칙 10이 제목을 "나머지 칸을 읽지 않고도 이해되게" 강제하고 있어 제목만으로도
// 무엇과 이어졌는지가 읽힌다. 상세가 필요하면 digestId로 digest.get을 따로 부른다.
export const DigestRelationSchema = z.object({
  type: DigestRelationPerspectiveSchema,
  digestId: z.string().uuid(),
  title: z.string(),
});
export type DigestRelation = z.infer<typeof DigestRelationSchema>;

// 다이제스트에 그 다이제스트에 붙은 관계를 얹은 모양 — 넣기·재추출 응답 한 항목.
export const DigestWithRelationsSchema = z.intersection(
  DigestSchema,
  z.object({ relations: z.array(DigestRelationSchema) }),
);
export type DigestWithRelations = z.infer<typeof DigestWithRelationsSchema>;

// 꺼내기 입력 — 뜻으로 찾는 질의 하나와 반환 개수 상한.
export const DIGEST_SEARCH_DEFAULT_LIMIT = 10;
export const DIGEST_SEARCH_MAX_LIMIT = 50;

export const DigestSearchInputSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().positive().max(DIGEST_SEARCH_MAX_LIMIT).optional(),
});
export type DigestSearchInput = z.infer<typeof DigestSearchInputSchema>;

// Digest에 소속 원문 id를 얹은 모양 — 다이제스트 하나를 그대로 돌려주는 응답.
// 원문은 안 싣는다. 필요하면 sourceId로 source.get을 따로 부른다. 관계도 안 싣는다 —
// digest.getRelations로 따로 간다.
export const DigestDetailSchema = z.intersection(
  DigestSchema,
  z.object({ sourceId: z.string().uuid() }),
);
export type DigestDetail = z.infer<typeof DigestDetailSchema>;

// 꺼내기 응답 하나당 항목 — 상세에 벡터 유사도 점수를 더한 것.
export const DigestSearchResultSchema = z.intersection(
  DigestDetailSchema,
  z.object({ score: z.number() }),
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

// 다이제스트 하나를 가리키는 공용 입력 — 상세 조회·관계 조회·삭제(가림)가 함께 쓴다.
export const DigestActionInputSchema = z.object({
  digestId: z.string().uuid(),
});
export type DigestActionInput = z.infer<typeof DigestActionInputSchema>;

export const DigestDeleteResultSchema = z.object({
  // 이미 가려진(또는 남의) digestId로 불러도 에러는 아니다 — source.delete와 같은 관행.
  success: z.boolean(),
});
export type DigestDeleteResult = z.infer<typeof DigestDeleteResultSchema>;
