import type { z } from "zod";

// 각 프로바이더의 네이티브 effort 어휘 — 중립 스케일로 정규화하지 않고 각 사 값을 그대로 쓴다.
// (OpenAI reasoning.effort / Claude adaptive thinking effort / Gemini thinking_level)
export type OpenAiEffort = "minimal" | "low" | "medium" | "high";
export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type GeminiEffort = "minimal" | "low" | "medium" | "high";
export type LlmEffort = OpenAiEffort | AnthropicEffort | GeminiEffort;

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
  /**
   * 모델의 사고/연산 깊이. task→모델 바인딩(task-routing)에서 그 모델 프로바이더의
   * 네이티브 값으로 정해져 라우터가 주입한다 — 제품 호출부는 forTask만 보면 된다.
   * 각 어댑터는 자기 프로바이더가 받는 값만 적용하고 그 외 값은 무시한다.
   */
  effort?: LlmEffort;
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
