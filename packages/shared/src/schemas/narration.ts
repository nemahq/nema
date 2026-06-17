import { z } from "zod";

export const NarrationInputSchema = z.object({
  query: z.string().trim().min(1),
  // 선택적 줄기 범위 — 주제 id 목록. 없으면 공간 전체에서 의미로 찾는다 (narration-design 3장).
  topicIds: z.array(z.string().uuid()).optional(),
});
export type NarrationInput = z.infer<typeof NarrationInputSchema>;
