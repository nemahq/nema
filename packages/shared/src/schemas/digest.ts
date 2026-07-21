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

// DB enum digest_status의 SSOT.
export const DIGEST_STATUSES = ["active", "archived"] as const;
export const DigestStatusSchema = z.enum(DIGEST_STATUSES);
export type DigestStatus = z.infer<typeof DigestStatusSchema>;

// generate_digest_public_id()(supabase/migrations)가 SQL로 같은 형식을 만든다 —
// 한쪽을 바꾸면 다른 쪽도 맞춰야 한다(Space public_id와 같은 패턴).
export const DIGEST_PUBLIC_ID_PREFIX = "dgt_";
export const DIGEST_PUBLIC_ID_LENGTH = 12;
export const DIGEST_PUBLIC_ID_PATTERN = new RegExp(
  `^${DIGEST_PUBLIC_ID_PREFIX}[0-9A-Za-z]{${DIGEST_PUBLIC_ID_LENGTH}}$`,
);

// 오래된 미결·가정 서피싱 임계값 — 타입별 차등(product-decisions-log.md #4).
// pending(미결)은 병목이 되기 전에 빨리, assumption(가정)은 검증 없이 오래
// 딛고 가는 위험이 있을 때만 재검토하면 되므로 더 길게.
export const PENDING_STALE_DAYS = 14;
export const ASSUMPTION_STALE_DAYS = 30;

// --- 스레드 피드 — Digest 목록 조회(browsing-flow.md "스레드 피드") ---

export const DIGEST_LIST_LIMIT_DEFAULT = 20;
export const DIGEST_LIST_LIMIT_MAX = 50;

// 시간순 keyset 페이지네이션 커서. created_at만으로는 못 끊는다 — 한 changeset
// 확정이 여러 Digest를 같은 트랜잭션(같은 now())에 만들면 created_at이 완전히
// 같을 수 있다(digest-review-service.ts getReview의 같은 문제의식 참고). Digest엔
// changeset.number 같은 Space 스코프 순번이 없어, id를 타이브레이커로 더한
// (created_at, id) 튜플로 대신 안정적인 페이지 경계를 만든다.
export const DigestListCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
export type DigestListCursor = z.infer<typeof DigestListCursorSchema>;

export const DigestListInputSchema = z.object({
  spaceId: z.string().uuid(),
  // 미지정("전체")이면 active만. 지정하면 그 Topic의 archived Digest도 접힌 채로
  // 함께 보인다 — surface-inventory.md "Topic으로 필터링하면 archived Digest도
  // 보인다": 특정 Topic으로 좁히는 순간 그 결과가 사실상 그 Topic의 Thread라서.
  topicId: z.string().uuid().optional(),
  // 오래된 판단 서피싱 조건(타입+경과일+미해소, product-decisions-log #4)을
  // 충족하는 미결·가정 Digest만.
  staleOnly: z.boolean().default(false),
  cursor: DigestListCursorSchema.nullish(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DIGEST_LIST_LIMIT_MAX)
    .default(DIGEST_LIST_LIMIT_DEFAULT),
});
export type DigestListInput = z.infer<typeof DigestListInputSchema>;

export const DigestListItemSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().regex(DIGEST_PUBLIC_ID_PATTERN),
  type: DigestTypeSchema,
  title: z.string(),
  description: z.string(),
  status: DigestStatusSchema,
  topics: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  createdAt: z.string().datetime({ offset: true }),
  // 셋은 배타적으로 화면에 뜨는 배지지만(더 급한 신호가 우선, surface-inventory.md
  // "스레드 탭"), 계약은 독립된 신호 셋으로 내려준다 — 우선순위 판단은 화면 몫.
  isProcessing: z.boolean(),
  hasPendingReview: z.boolean(),
  isStale: z.boolean(),
});
export type DigestListItem = z.infer<typeof DigestListItemSchema>;
