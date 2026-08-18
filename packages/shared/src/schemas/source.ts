import { z } from "zod";

import { DigestListItemSchema, DigestWithRelationsSchema } from "./digest";

// DB enum digestion_status의 SSOT. processing(처리 중) / completed(정상 종료) /
// failed(파이프라인 도중 실패) — 셋 다 서로 다른 상황이라 화면이 구분해서 다룬다
// (fix/draft-error-state).
export const DIGESTION_STATUSES = [
  "processing",
  "completed",
  "failed",
] as const;
export const DigestionStatusSchema = z.enum(DIGESTION_STATUSES);
export type DigestionStatus = z.infer<typeof DigestionStatusSchema>;

// 초안 카드가 실전에서 받는 status는 이 둘뿐이다(v_draft_sources가 processing을
// 미리 거른다) — SourceDraftSchema가 DigestionStatusSchema 대신 이 좁은
// 스키마를 쓰는 이유. 화면이 processing을 "일어날 수 없는 값"으로 안 다루고
// 아예 타입에서 배제한다.
export const SOURCE_DRAFT_STATUSES = ["failed", "completed"] as const;
export const SourceDraftStatusSchema = z.enum(SOURCE_DRAFT_STATUSES);
export type SourceDraftStatus = z.infer<typeof SourceDraftStatusSchema>;

// 원문 입구 상한 — 정확성이 아니라 비용/폭주 브레이크. 정당한 장문(회의록·보고서)은
// 통과시키려 높게 잡는다. legacy(SOURCE_BODY_MAX_LENGTH)와 같은 값.
export const SOURCE_BODY_MAX_LENGTH = 100_000;

// generate_source_public_id()(supabase/migrations)가 SQL로 같은 형식을 만든다 —
// 한쪽을 바꾸면 다른 쪽도 맞춰야 한다. legacy엔 Source public_id가 없어 새로 둔
// 접두사다(legacy Digest는 dgt_, Source는 legacy에 없던 개념이라 src_).
export const SOURCE_PUBLIC_ID_PREFIX = "src_";
export const SOURCE_PUBLIC_ID_LENGTH = 12;
export const SOURCE_PUBLIC_ID_PATTERN = new RegExp(
  `^${SOURCE_PUBLIC_ID_PREFIX}[0-9A-Za-z]{${SOURCE_PUBLIC_ID_LENGTH}}$`,
);

export const SourceIngestInputSchema = z.object({
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH),
});
export type SourceIngestInput = z.infer<typeof SourceIngestInputSchema>;

// 재추출·삭제 공용 입력 — 둘 다 "이 원문에" 말고는 인자가 없다. get은 안 섞는다
// (SourceGetInputSchema 참고) — 목록·상세가 이미 내부 id를 들고 있어 주소를
// 거치지 않는 이 둘과 달리, get은 주소(?source=)에서 값이 들어온다.
export const SourceActionInputSchema = z.object({
  sourceId: z.string().uuid(),
});
export type SourceActionInput = z.infer<typeof SourceActionInputSchema>;

// 상세 조회 전용 입력 — 웹은 주소(?source=)의 public_id로 부른다. MCP(get_source
// 도구)는 search_digests가 돌려준 내부 id를 그대로 이어 부르므로(apps/mcp/src/server.ts)
// 그쪽도 받아야 한다 — 재추출·삭제(SourceActionInputSchema)와 달리 get은
// 호출자가 둘로 갈린다.
export const SourceGetInputSchema = z.union([
  z.object({ sourcePublicId: z.string().regex(SOURCE_PUBLIC_ID_PATTERN) }),
  z.object({ sourceId: z.string().uuid() }),
]);
export type SourceGetInput = z.infer<typeof SourceGetInputSchema>;

// 넣기·재추출 공용 응답 — 화면이 없어 이 응답이 결과를 보는 유일한 창구라 다이제스트를
// 전부 실어보낸다(킥오프 "흐름 — 동기" 참고). 이번에 이어진 관계도 함께 싣는다 —
// 방금 넣은 것이 쌓인 것과 어떻게 이어졌는지가 던지기 직후에 가장 궁금한 값이라,
// 여기서만은 관계를 따로 물으러 가지 않게 한다.
export const SourceIngestResultSchema = z.object({
  sourceId: z.string().uuid(),
  digests: z.array(DigestWithRelationsSchema),
});
export type SourceIngestResult = z.infer<typeof SourceIngestResultSchema>;

export const SourceDeleteResultSchema = z.object({
  // 이미 없는(또는 남의) sourceId로 불러도 에러는 아니다 — 지울 게 없었다는 뜻.
  success: z.boolean(),
});
export type SourceDeleteResult = z.infer<typeof SourceDeleteResultSchema>;

// 벌크 삭제 상한 — 개별 tRPC 호출로 sourceId 개수만큼 source.delete를 부르면
// URL이 프로시저명을 반복 이어붙여 Fastify maxParamLength를 넘길 수 있었다(#432).
// deleteMany는 프로시저 호출 자체가 하나뿐이라 그 문제는 안 나지만, 그렇다고
// 무제한 배열을 받으면 다른 종류의 남용(초대형 페이로드)에 열리므로 넉넉한 상한을 둔다.
export const SOURCE_DELETE_MANY_MAX = 200;

export const SourceDeleteManyInputSchema = z.object({
  sourceIds: z.array(z.string().uuid()).min(1).max(SOURCE_DELETE_MANY_MAX),
});
export type SourceDeleteManyInput = z.infer<typeof SourceDeleteManyInputSchema>;

// name — 원문 이름. sources.name(생성 컬럼)을 그대로 실어보낸다 — title이 있으면
// title을, 없으면 본문 앞부분을 담는다. 200은 표시 폭이 아니라 응답 폭주를 막는
// 상한이라 말줄임표가 안 붙는다 — 화면에서 필요한 만큼 잘라 쓴다. source.get·
// listWithDigests·listDraftSources 셋 다 같은 컬럼을 읽어 이름의 정의가 하나다.
export const SourceGetResultSchema = z.object({
  sourceId: z.string().uuid(),
  name: z.string(),
  body: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type SourceGetResult = z.infer<typeof SourceGetResultSchema>;

// 다이제스트 목록 화면 — 원문 하나당 한 행, 그 안에 다이제스트를 추출 순서대로
// 묶는다. digests는 가려지지 않은 것만 담는다(다 가려도 원문 행 자체는 남는다 —
// source.listWithDigests 계약 참고). name은 위 SourceGetResultSchema와 같은 정의.
// publicId — 원문 상세 링크(?source=)가 쓰는 값. sourceId(내부)는 삭제에 쓰인다.
export const SourceWithDigestsSchema = z.object({
  sourceId: z.string().uuid(),
  publicId: z.string().regex(SOURCE_PUBLIC_ID_PATTERN),
  name: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  digests: z.array(DigestListItemSchema),
});
export type SourceWithDigests = z.infer<typeof SourceWithDigestsSchema>;

// 다이제스트 목록 화면의 무한 스크롤 — 단위는 원문이다. 다이제스트 단위로 끊으면
// 같은 원문이 두 페이지에 걸쳐 잘려, "이 원문에서 이만큼 나왔다"는 2층 구조의
// 뜻이 깨진다. legacy(changesets.number, 단일 정수)와 달리 sources엔 순차 번호가
// 없어 (created_at, id) 복합 커서를 쓴다 — created_at이 같은 원문이 있을 수
// 있어 id가 tie-breaker로 필요하다.
export const SourceListWithDigestsCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
export type SourceListWithDigestsCursor = z.infer<
  typeof SourceListWithDigestsCursorSchema
>;

// legacy 변경셋(CHANGESET_LIST_LIMIT_DEFAULT 20/최대 100)보다 보수적인 이유는
// 행 수 배율 — 변경셋은 1층 1행이지만 여기는 원문 1개가 다이제스트를 여럿
// 끌고 온다. 최대 30이 예전 SOURCE_LIST_SAFETY_LIMIT(500)이 하던 폭주 방지
// 역할을 대신한다.
export const SOURCE_LIST_WITH_DIGESTS_LIMIT_DEFAULT = 10;
export const SOURCE_LIST_WITH_DIGESTS_LIMIT_MAX = 30;

export const SourceListWithDigestsInputSchema = z.object({
  cursor: SourceListWithDigestsCursorSchema.nullable().optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(SOURCE_LIST_WITH_DIGESTS_LIMIT_MAX)
    .default(SOURCE_LIST_WITH_DIGESTS_LIMIT_DEFAULT),
});
export type SourceListWithDigestsInput = z.infer<
  typeof SourceListWithDigestsInputSchema
>;

export const SourceListWithDigestsResultSchema = z.object({
  items: z.array(SourceWithDigestsSchema),
  nextCursor: SourceListWithDigestsCursorSchema.nullable(),
});
export type SourceListWithDigestsResult = z.infer<
  typeof SourceListWithDigestsResultSchema
>;

// 초안 화면 — 정리 결과가 없거나 처리에 실패한 원문만 담는다. 화면은 status로
// 실패 아이콘/결과없음 아이콘을 가른다. name은 위 SourceGetResultSchema와 같은
// 정의. bodyPreview는 카드 본문 4줄 미리보기 전용(400자, sources.body_preview
// 생성 컬럼) — name과 달리 title 유무와 무관하게 항상 본문 앞부분이다.
export const SourceDraftSchema = z.object({
  sourceId: z.string().uuid(),
  publicId: z.string().regex(SOURCE_PUBLIC_ID_PATTERN),
  name: z.string(),
  bodyPreview: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  status: SourceDraftStatusSchema,
});
export type SourceDraft = z.infer<typeof SourceDraftSchema>;
