import { z } from "zod";

import { DIGEST_TITLE_MAX_LENGTH } from "./digest";

// 원본 입구 상한 — 한 글이 비정상적으로 크면(책·덤프) 추출·임베딩·잇기를 한꺼번에
// 폭주시키므로 박제 전에 거부한다(쪼개서 다시 넣게). 정확성이 아니라 비용/폭주
// 브레이크라 정밀할 필요 없이 "확실히 비정상"만 잡으면 된다 — 정당한 장문(긴 회의록·
// 보고서)은 통과시키려 높게 잡는다(거짓 거부가 콘텐츠를 잃으니 높은 쪽으로 기운다).
// 노션 페이지(~1,000블록/~20만자)의 절반 앵커. 진짜 값은 dogfooding의 문서 길이
// 분포로 보정(relation-design §11).
export const SOURCE_BODY_MAX_LENGTH = 100_000;

// 헤드라인 상한 — Digest 제목과 같은 성격(짧은 한 문장)이라 값 자체를 그대로 물려받는다
// (리터럴 복사가 아니라 참조라 두 상한이 나중에 갈릴 일이 없다).
export const SOURCE_TITLE_MAX_LENGTH = DIGEST_TITLE_MAX_LENGTH;

export const SourceCreateInputSchema = z.object({
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH),
  sessionId: z.string().uuid().optional(),
  // 미지정 시 서버가 1인 단계 기본 Space(가장 오래된 멤버십)로 대체한다.
  spaceId: z.string().uuid().optional(),
  // 작성자 존(IANA) — 내용 속 기한("금요일까지")을 이 존 기준으로 풀어 due_date를 채운다.
  // 클라이언트가 브라우저 존을 싣는다(temporal-query-design 7장).
  timeZone: z.string().min(1).optional(),
});

export type SourceCreateInput = z.infer<typeof SourceCreateInputSchema>;

export const SourceGetInputSchema = z.object({
  sourceId: z.string().uuid(),
});

export type SourceGetInput = z.infer<typeof SourceGetInputSchema>;

// 초안 액션(취소·삭제·Digest 추출 실행) 공용 입력 — 셋 다 "이 원본에" 말고는 인자가 없다.
// 어떤 상태에서 무엇이 허용되는지는 전부 서버 판정이라(RPC의 WHERE 가드) 클라이언트가
// 상태를 실어 보낼 게 없다.
export const SourceActionInputSchema = z.object({
  sourceId: z.string().uuid(),
});

export type SourceActionInput = z.infer<typeof SourceActionInputSchema>;

// 벌크 삭제 상한 — tRPC 배치 링크로 sourceId 개수만큼 source.delete를 개별 호출하면
// URL이 프로시저명을 반복 이어붙여 Fastify maxParamLength를 넘길 수 있었다(#432).
// deleteMany는 프로시저 호출 자체가 하나뿐이라 그 문제는 안 나지만, 그렇다고 무제한
// 배열을 받으면 다른 종류의 남용(초대형 페이로드)에 열리므로 넉넉한 상한을 둔다.
export const SOURCE_DELETE_MANY_MAX = 200;

export const SourceDeleteManyInputSchema = z.object({
  sourceIds: z.array(z.string().uuid()).min(1).max(SOURCE_DELETE_MANY_MAX),
});

export type SourceDeleteManyInput = z.infer<typeof SourceDeleteManyInputSchema>;

// 위 공용 입력과 달리 spaceId가 있다 — 상태 가드는 여전히 서버 몫이지만,
// 목적지는 서버가 판정할 수 없는 클라이언트 선택값이라 인자로 실어야 한다.
export const SourceReassignSpaceInputSchema = SourceActionInputSchema.extend({
  spaceId: z.string().uuid(),
});

export type SourceReassignSpaceInput = z.infer<
  typeof SourceReassignSpaceInputSchema
>;

// 초안에서 Source 제목 편집 — 어떤 상태에서 허용되는지는 RPC의 WHERE 가드가 판정한다.
export const SourceUpdateTitleInputSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().trim().min(1).max(SOURCE_TITLE_MAX_LENGTH),
});

export type SourceUpdateTitleInput = z.infer<
  typeof SourceUpdateTitleInputSchema
>;

// 재추출 전에 원본 고치기 — 상한은 생성과 같은 SOURCE_BODY_MAX_LENGTH(같은 글이
// 입구를 통과하는 기준과 편집을 통과하는 기준이 다를 이유가 없다). 어떤 상태에서
// 허용되는지는 RPC의 WHERE 가드가 판정한다(열린 리뷰가 있으면 잠긴다).
export const SourceUpdateBodyInputSchema = z.object({
  sourceId: z.string().uuid(),
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH),
});

export type SourceUpdateBodyInput = z.infer<typeof SourceUpdateBodyInputSchema>;
