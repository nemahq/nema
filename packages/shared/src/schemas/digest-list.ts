import { z } from "zod";

import { DigestSchema } from "./digest";
import { StatementSchema } from "./statement";

// digest.list·digest.get 전용 응답 항목 — source.ts의 SourceIngestResultSchema(ingest
// 도그푸딩용, sourceId가 최상위에 하나뿐)와 달리 다이제스트가 여러 원문에 걸쳐 섞여
// 나오므로 항목마다 sourceId를 싣는다. 관계(statement_relations)는 아직 테이블이
// 없어 필드 자체를 넣지 않는다 — 자리를 만들어두지 않는다.
//
// digest.ts·statement.ts 둘 다에 기대므로 별도 파일로 둔다 — digest.ts 안에
// 두면 digest.ts→statement.ts→digest.ts 순환 참조가 생긴다(statement.ts가
// DigestType을 쓰기 때문).
export const DigestListEntrySchema = z.intersection(
  DigestSchema,
  z.object({
    sourceId: z.string().uuid(),
    statement: StatementSchema.nullable(),
  }),
);
export type DigestListEntry = z.infer<typeof DigestListEntrySchema>;

export const DigestListResultSchema = z.object({
  digests: z.array(DigestListEntrySchema),
});
export type DigestListResult = z.infer<typeof DigestListResultSchema>;

export const DigestGetInputSchema = z.object({
  digestId: z.string().uuid(),
});
export type DigestGetInput = z.infer<typeof DigestGetInputSchema>;
