import { z } from "zod";

// --- PGMQ 메시지 ---
// 메시지는 "깨워라" 하나 — 어떤 RPC가 보냈든 워커는 같은 사이클을 돈다.
// 미래 계약(archive 계열)이 다른 type을 보내도 깨우기로만 쓰므로 message는 검증하지 않는다.

export const TriggerMessageSchema = z.object({
  msg_id: z.number(),
  read_ct: z.number(),
  message: z.unknown(),
});

export type TriggerMessage = z.infer<typeof TriggerMessageSchema>;

// --- fetch_pending_* RPC 반환 행 ---

export const PendingSourceSchema = z.object({
  id: z.string().uuid(),
  space_id: z.string().uuid(),
  author_id: z.string().uuid().nullable(),
  session_id: z.string().uuid().nullable(),
  body: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
});

export type PendingSource = z.infer<typeof PendingSourceSchema>;

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
