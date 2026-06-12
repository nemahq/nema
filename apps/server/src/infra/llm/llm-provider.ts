import type { z } from "zod";

// "system"은 systemPrompt 파라미터로 별도 전달하므로 role에서 제외
export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCallParams {
  systemPrompt: string;
  messages: [LlmMessage, ...LlmMessage[]];
  temperature?: number;
  signal?: AbortSignal;
  /** 추론 모델의 사고 깊이 — 규칙 적용에 가까운 호출(추출 등)은 낮춰 지연·변동을 줄인다 */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  /** 이 호출만의 타임아웃 — 미지정 시 provider(클라이언트) 기본값 */
  timeoutMs?: number;
}

export interface GenerateStructuredParams<T> extends LlmCallParams {
  schema: z.ZodType<T>;
  schemaName: string;
}

export type GenerateStreamParams = LlmCallParams;

export type GenerateTextParams = LlmCallParams;

export interface LlmProvider {
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;
  generateStream(params: GenerateStreamParams): AsyncIterable<string>;
  generateText(params: GenerateTextParams): Promise<string>;
}
