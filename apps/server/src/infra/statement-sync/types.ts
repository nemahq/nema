import { z } from "zod";

import { DigestBodySchema } from "@nema-io/shared";

// --- PGMQ 메시지 ---
// 메시지는 "깨워라" 하나 — 어떤 RPC가 보냈든 워커는 같은 사이클을 돈다.
// 미래 계약(archive 계열)이 다른 type을 보내도 깨우기로만 쓰므로 message는 검증하지 않는다.

export const TriggerMessageSchema = z.object({
  msg_id: z.number(),
  read_ct: z.number(),
  message: z.unknown(),
});

export type TriggerMessage = z.infer<typeof TriggerMessageSchema>;

// vector_purge 큐 — purge가 hard delete한 진술의 Qdrant 벡터를 워커가 지우도록 넘긴다
// (행이 사라져 임베딩 패스가 못 보는 벡터를 정리하는 유일한 경로).
export const VectorPurgeMessageSchema = z.object({
  msg_id: z.number(),
  message: z.object({
    statement_ids: z.array(z.string().uuid()),
  }),
});

export type VectorPurgeMessage = z.infer<typeof VectorPurgeMessageSchema>;

// --- fetch_pending_* RPC 반환 행 ---

// ⓪ 생성(digestion) 대상 원문. workspace_id는 Tag·Reference 레지스트리(Workspace
// 스코프)를 프롬프트에 실을 때 필요해 RPC가 함께 반환한다.
export const PendingDigestionSourceSchema = z.object({
  id: z.string().uuid(),
  space_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  author_id: z.string().uuid().nullable(),
  body: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
});

export type PendingDigestionSource = z.infer<
  typeof PendingDigestionSourceSchema
>;

export const PendingSourceSchema = z.object({
  id: z.string().uuid(),
  space_id: z.string().uuid(),
  author_id: z.string().uuid().nullable(),
  body: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  // 작성자 존(IANA) — 내용 속 기한을 작성 시점 기준으로 풀 때 쓴다. 옛 글·미전달이면 null.
  author_timezone: z.string().nullable(),
});

export type PendingSource = z.infer<typeof PendingSourceSchema>;

// 추출 입력 = 원문의 확정 Digest. 원문 body가 아니라 이 구조화 body에서 진술을 뽑는다.
// body는 신뢰 경계 밖(DB CHECK는 판별자만 지킴)이라 판별 유니언으로 검증한다 — 어긋나면
// 추출 프롬프트가 잘못된 구조를 받으니 조용히 넘기지 않고 검증 실패로 드러낸다.
export const SourceDigestSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  body: DigestBodySchema,
});

export type SourceDigest = z.infer<typeof SourceDigestSchema>;

export const PendingStatementSchema = z.object({
  id: z.string().uuid(),
  space_id: z.string().uuid(),
  content: z.string().min(1),
  type: z.enum(["claim", "question", "todo"]),
  confidence: z.enum(["certain", "guess"]).nullable(),
  status: z.enum(["active", "archived"]),
  created_at: z.string().datetime({ offset: true }),
});

export type PendingStatement = z.infer<typeof PendingStatementSchema>;

// --- 잇기(linking) ③단계 ---

export const PendingLinkingSourceSchema = z.object({
  id: z.string().uuid(),
  space_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});

export type PendingLinkingSource = z.infer<typeof PendingLinkingSourceSchema>;

// 잇기 대상 원문의 새 진술(배치). ingestion_status로 ⓐ 앵커 가능 여부를 가린다
// (벡터 없는 failed 진술은 자기 이웃 검색의 앵커가 될 수 없다).
export const LinkingBatchStatementSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1),
  type: z.enum(["claim", "question", "todo"]),
  confidence: z.enum(["certain", "guess"]).nullable(),
  ingestion_status: z.enum(["pending", "completed", "failed"]),
});

export type LinkingBatchStatement = z.infer<typeof LinkingBatchStatementSchema>;

// 후보(기존 진술) — 본문만 필요. 벡터 이웃이라 늘 active.
export const LinkingCandidateStatementSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1),
  type: z.enum(["claim", "question", "todo"]),
  confidence: z.enum(["certain", "guess"]).nullable(),
});

export type LinkingCandidateStatement = z.infer<
  typeof LinkingCandidateStatementSchema
>;
