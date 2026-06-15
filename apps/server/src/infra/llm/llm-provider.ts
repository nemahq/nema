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
  /** 모델의 사고/연산 깊이 힌트 — 프로바이더가 자기 방식으로 매핑하거나 무시한다. 규칙 적용에 가까운 호출은 낮춰 지연·변동을 줄인다 */
  computeLevel?: "minimal" | "low" | "medium" | "high";
  /**
   * 시도 단위 타임아웃 — 미지정 시 provider(클라이언트) 기본값.
   * 주의: SDK가 타임아웃을 자동 재시도하므로(기본 2회) 호출 전체의 상한이 아니다.
   * 벽시계 상한이 필요하면 maxRetries: 0을 함께 전달할 것.
   */
  timeoutMs?: number;
  /** SDK 자동 재시도 횟수 — 호출자가 자체 재시도를 가지면 0으로 꺼서 주인을 한 층으로 */
  maxRetries?: number;
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
