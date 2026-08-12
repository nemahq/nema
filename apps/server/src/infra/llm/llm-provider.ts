import type { z } from "zod";

export interface LlmMessage {
  role: "user";
  content: string;
}

export interface GenerateStructuredParams<T> {
  systemPrompt: string;
  messages: [LlmMessage, ...LlmMessage[]];
  schema: z.ZodType<T>;
}

// generateStructured만 있다 — 이번 슬라이스는 다이제스트 생성(구조화 출력) 한 콜뿐이다.
// generateText·generateStream은 쓰는 곳이 생기면 그때 추가한다.
export interface LlmProvider {
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;
}
