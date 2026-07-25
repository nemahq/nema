import { z } from "zod";

// DB enum reference_type의 SSOT (07-modeling Reference).
// organization은 법인·팀 같은 행위주체, product는 그 주체가 만든 제품·서비스 자체 —
// 판단 대상이 달라 별개 타입이다(예: 비바리퍼블리카 vs 토스).
export const REFERENCE_TYPES = [
  "person",
  "organization",
  "project",
  "product",
  "term",
] as const;

export const ReferenceTypeSchema = z.enum(REFERENCE_TYPES);
export type ReferenceType = z.infer<typeof ReferenceTypeSchema>;

// DB enum reference_status의 SSOT (07-modeling §완전 삭제).
export const REFERENCE_STATUSES = ["active", "archived", "trashed"] as const;
export const ReferenceStatusSchema = z.enum(REFERENCE_STATUSES);
export type ReferenceStatus = z.infer<typeof ReferenceStatusSchema>;

export const REFERENCE_TITLE_MAX_LENGTH = 200;
// body는 "다듬어지며 유지되는 내용"이라 상한을 원문(10만 자)보다 훨씬 작게 —
// 레퍼런스는 정의·설명이지 문서 보관함이 아니다. 다만 프로필·스펙 붙여넣기 같은
// 정상 사용을 물지 않도록 넉넉히 잡는다(입력 거부가 가장 나쁜 경험).
export const REFERENCE_BODY_MAX_LENGTH = 20_000;
// 대표 링크(홈페이지·LinkedIn·repo·docs) — 대상을 식별하는 소수의 링크지
// Digest가 논하는 링크 더미가 아니라, Digest 상한보다 작게 잡는다.
export const REFERENCE_EXTERNAL_URLS_MAX = 10;

// Reference 액션(삭제·인용 조회·단건 조회) 공용 입력 — 어떤 상태에서 무엇이
// 허용되는지는 전부 서버 판정이라(RPC의 WHERE 가드) source의
// SourceActionInputSchema와 같은 결.
export const ReferenceActionInputSchema = z.object({
  referenceId: z.string().uuid(),
});

export type ReferenceActionInput = z.infer<typeof ReferenceActionInputSchema>;

// Reference 직접 수정 — update_reference RPC와 같은 계약: 전체 상태를 받아
// 서버가 필드별 diff를 계산한다(생략 필드 없음 — externalUrls를 빼면 "생략 =
// 빈 값으로 변경"이 되는 트랩, RPC 주석 참고). type·title·body 상한은 신규
// 생성(NewReferenceDraftSchema)과 같은 상수를 공유한다.
export const ReferenceUpdateInputSchema = z.object({
  referenceId: z.string().uuid(),
  type: ReferenceTypeSchema,
  title: z.string().trim().min(1).max(REFERENCE_TITLE_MAX_LENGTH),
  body: z.string().trim().min(1).max(REFERENCE_BODY_MAX_LENGTH),
  externalUrls: z.array(z.string().url()).max(REFERENCE_EXTERNAL_URLS_MAX),
});
export type ReferenceUpdateInput = z.infer<typeof ReferenceUpdateInputSchema>;

// Reference Tag 추가/제거 공용 입력 — link_reference_tag/unlink_reference_tag
// RPC와 같은 계약(둘 다 reference_id·tag_id 한 쌍만 받는다).
export const ReferenceTagActionInputSchema = z.object({
  referenceId: z.string().uuid(),
  tagId: z.string().uuid(),
});
export type ReferenceTagActionInput = z.infer<
  typeof ReferenceTagActionInputSchema
>;

export const REFERENCE_LIST_LIMIT_DEFAULT = 30;
export const REFERENCE_LIST_LIMIT_MAX = 100;

export const REFERENCE_LIST_SORT_KEYS = ["title", "createdAt"] as const;
export const ReferenceListSortKeySchema = z.enum(REFERENCE_LIST_SORT_KEYS);
export type ReferenceListSortKey = z.infer<typeof ReferenceListSortKeySchema>;

export const ReferenceListSortDirectionSchema = z.enum(["asc", "desc"]);
export type ReferenceListSortDirection = z.infer<
  typeof ReferenceListSortDirectionSchema
>;

export const ReferenceListStatusFilterSchema = z.enum([
  "active",
  "archived",
  "all",
]);
export type ReferenceListStatusFilter = z.infer<
  typeof ReferenceListStatusFilterSchema
>;

// 검색·필터·정렬·페이지네이션을 전부 서버로 옮긴 목록 계약(사전·위키 찾아보기
// 목적이라 100건 캡 안에서만 도는 클라이언트 필터로는 전체를 못 찾는 문제가
// 있었다). status·type 미지정 시 필터 없음(trashed만 항상 제외) — 기존
// dev-harness처럼 전체를 보던 소비처와 호환.
export const ReferenceListInputSchema = z.object({
  search: z.string().trim().max(REFERENCE_TITLE_MAX_LENGTH).optional(),
  type: ReferenceTypeSchema.optional(),
  status: ReferenceListStatusFilterSchema.optional(),
  sortKey: ReferenceListSortKeySchema.default("title"),
  sortDirection: ReferenceListSortDirectionSchema.default("asc"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(REFERENCE_LIST_LIMIT_MAX)
    .default(REFERENCE_LIST_LIMIT_DEFAULT),
  cursor: z.string().optional(),
});
export type ReferenceListInput = z.infer<typeof ReferenceListInputSchema>;
