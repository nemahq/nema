import { z } from "zod";

import type { DigestType } from "./digest";

// Statement(진술) — Digest의 주된 칸을 혼자 읽히는 문장으로 만든 것.
// docs/blueprints/first-product/engine/linking.md 2.2 "진술이 들고 있는 것":
// 어느 칸에서 나왔는지(digestField)만 들면 된다 — 주된 칸 다섯이 이름이 달라
// 칸만 알면 다이제스트 유형도 정해진다.
export const DIGEST_FIELDS = [
  "choice",
  "question",
  "finding",
  "concept",
  "assumption",
] as const;

export const DigestFieldSchema = z.enum(DIGEST_FIELDS);
export type DigestField = z.infer<typeof DigestFieldSchema>;

// 다이제스트 유형 → 그 유형의 주된 칸. linking.md 2.2 "무엇을 뽑나" 표와 같다.
export const DIGEST_FIELD_BY_TYPE = {
  decision: "choice",
  pending: "question",
  learning: "finding",
  idea: "concept",
  assumption: "assumption",
} as const satisfies Record<DigestType, DigestField>;

export const StatementSchema = z.object({
  id: z.string().uuid(),
  digestId: z.string().uuid(),
  digestField: DigestFieldSchema,
  content: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
});
export type Statement = z.infer<typeof StatementSchema>;
