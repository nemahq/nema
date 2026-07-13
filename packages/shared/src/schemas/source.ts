import { z } from "zod";

// 원본 입구 상한 — 한 글이 비정상적으로 크면(책·덤프) 추출·임베딩·잇기를 한꺼번에
// 폭주시키므로 박제 전에 거부한다(쪼개서 다시 넣게). 정확성이 아니라 비용/폭주
// 브레이크라 정밀할 필요 없이 "확실히 비정상"만 잡으면 된다 — 정당한 장문(긴 회의록·
// 보고서)은 통과시키려 높게 잡는다(거짓 거부가 콘텐츠를 잃으니 높은 쪽으로 기운다).
// 노션 페이지(~1,000블록/~20만자)의 절반 앵커. 진짜 값은 dogfooding의 문서 길이
// 분포로 보정(relation-design §11).
export const SOURCE_BODY_MAX_LENGTH = 100_000;

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

// 위 공용 입력과 달리 spaceId가 있다 — 상태 가드는 여전히 서버 몫이지만,
// 목적지는 서버가 판정할 수 없는 클라이언트 선택값이라 인자로 실어야 한다.
export const SourceReassignSpaceInputSchema = SourceActionInputSchema.extend({
  spaceId: z.string().uuid(),
});

export type SourceReassignSpaceInput = z.infer<
  typeof SourceReassignSpaceInputSchema
>;
