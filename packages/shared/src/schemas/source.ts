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
  // 작성자 존(IANA) — 내용 속 기한("금요일까지")을 이 존 기준으로 풀어 due_date를 채운다.
  // 클라이언트가 브라우저 존을 싣는다(temporal-query-design 7장).
  timeZone: z.string().min(1).optional(),
});

export type SourceCreateInput = z.infer<typeof SourceCreateInputSchema>;

export const SourceGetInputSchema = z.object({
  sourceId: z.string().uuid(),
});

export type SourceGetInput = z.infer<typeof SourceGetInputSchema>;
