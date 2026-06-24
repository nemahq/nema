import { z } from "zod";

export const NarrationInputSchema = z.object({
  query: z.string().trim().min(1),
  // 시간 질의("이번 주 마감")의 "이번 주"를 풀려면 작성자 존이 필요하다 — 없으면 의미검색으로 강등.
  timeZone: z
    .string()
    .min(1)
    .optional()
    .describe(
      "IANA time zone (e.g. Asia/Seoul) to resolve relative time queries like 'this week'",
    ),
});
export type NarrationInput = z.infer<typeof NarrationInputSchema>;
