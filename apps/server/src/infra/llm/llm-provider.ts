import { z } from "zod";

// effort 어휘 단일 출처 — 전 프로바이더 네이티브 값의 합집합. dev-router 런타임 검증도
// 이 스키마를 공유한다(값을 한쪽에만 늘려 검증이 조용히 어긋나는 걸 막는다).
export const LLM_EFFORT_SCHEMA = z.enum([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export type LlmEffort = z.infer<typeof LLM_EFFORT_SCHEMA>;

// 각 프로바이더가 실제 받는 부분집합 — 어댑터 가드·set-time 검증이 이걸로 좁힌다.
// (OpenAI reasoning.effort / Claude adaptive thinking effort / Gemini thinking_level)
export type OpenAiEffort = "minimal" | "low" | "medium" | "high";
export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type GeminiEffort = "minimal" | "low" | "medium" | "high";

// "system"은 systemPrompt 파라미터로 별도 전달하므로 role에서 제외
export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

// 호출 1건의 토큰 usage — 어댑터가 프로바이더별 필드를 청구 기준으로 정규화해 채운다.
// input/output은 청구 총량(OpenAI·Claude는 추론/thinking이 output에 포함, Gemini는 thoughts를 더한다).
// cached/reasoning은 투명성용 선택 분해 — 비용 산출엔 input/output만 쓴다.
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
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
  /**
   * 토큰 usage 보고 — 가성비 측정(eval)이 비용을 산출하려 주입한다. 제품 호출부는
   * 넘기지 않으므로 동작 불변. 어댑터는 성공한 호출에 한해 청구 기준으로 1회 호출한다.
   */
  onUsage?: (usage: LlmUsage) => void;
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
