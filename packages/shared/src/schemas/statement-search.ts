import { z } from "zod";

export const StatementSearchInputSchema = z.object({
  query: z.string().trim().min(1),
  // 클라이언트가 브라우저 존(IANA)을 실어 보낸다 — 시간 질의의 "이번 주/오늘"을 이 존 기준으로 푼다.
  timeZone: z.string().min(1).optional(),
});
export type StatementSearchInput = z.infer<typeof StatementSearchInputSchema>;
