import { z } from "zod";

import { DigestListItemSchema, DigestSchema } from "./digest";

// DB enum digestion_status의 SSOT.
export const DIGESTION_STATUSES = ["pending", "completed"] as const;
export const DigestionStatusSchema = z.enum(DIGESTION_STATUSES);
export type DigestionStatus = z.infer<typeof DigestionStatusSchema>;

// 원문 입구 상한 — 정확성이 아니라 비용/폭주 브레이크. 정당한 장문(회의록·보고서)은
// 통과시키려 높게 잡는다. legacy(SOURCE_BODY_MAX_LENGTH)와 같은 값.
export const SOURCE_BODY_MAX_LENGTH = 100_000;

export const SourceIngestInputSchema = z.object({
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH),
});
export type SourceIngestInput = z.infer<typeof SourceIngestInputSchema>;

// 재추출·삭제 공용 입력 — 둘 다 "이 원문에" 말고는 인자가 없다.
export const SourceActionInputSchema = z.object({
  sourceId: z.string().uuid(),
});
export type SourceActionInput = z.infer<typeof SourceActionInputSchema>;

// 넣기·재추출 공용 응답 — 화면이 없어 이 응답이 결과를 보는 유일한 창구라 다이제스트를
// 전부 실어보낸다(킥오프 "흐름 — 동기" 참고).
export const SourceIngestResultSchema = z.object({
  sourceId: z.string().uuid(),
  digests: z.array(DigestSchema),
});
export type SourceIngestResult = z.infer<typeof SourceIngestResultSchema>;

export const SourceDeleteResultSchema = z.object({
  // 이미 없는(또는 남의) sourceId로 불러도 에러는 아니다 — 지울 게 없었다는 뜻.
  success: z.boolean(),
});
export type SourceDeleteResult = z.infer<typeof SourceDeleteResultSchema>;

export const SourceGetResultSchema = z.object({
  sourceId: z.string().uuid(),
  body: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type SourceGetResult = z.infer<typeof SourceGetResultSchema>;

// 다이제스트 목록 화면 — 원문 하나당 한 행, 그 안에 다이제스트를 추출 순서대로
// 묶는다. digests는 가려지지 않은 것만 담는다(다 가려도 원문 행 자체는 남는다 —
// source.listWithDigests 계약 참고).
export const SourceWithDigestsSchema = z.object({
  sourceId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  digests: z.array(DigestListItemSchema),
});
export type SourceWithDigests = z.infer<typeof SourceWithDigestsSchema>;

// 초안 화면 — 정리 결과가 없거나 처리에 실패한 원문. status는 화면이 "재시도 중"
// 표시 등에 쓴다.
export const SourceDraftSchema = z.object({
  sourceId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  status: DigestionStatusSchema,
});
export type SourceDraft = z.infer<typeof SourceDraftSchema>;
