import { z } from "zod";
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
} from "@google/genai";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import { LlmError } from "./llm-error";
import type {
  GenerateStreamParams,
  GenerateStructuredParams,
  GenerateTextParams,
  LlmMessage,
  LlmProvider,
} from "./llm-provider";

// effort → Gemini 3.x thinking_level(enum). Gemini가 받는 값만 매핑하고 나머지는 무시한다.
// 주의: 라이브 미검증(작동 키·Vertex 미설정) — 모델 id 3.x 갱신과 함께 후속 검증 필요.
function toThinkingLevel(
  effort: GenerateTextParams["effort"],
): ThinkingLevel | undefined {
  switch (effort) {
    case "minimal":
      return ThinkingLevel.MINIMAL;
    case "low":
      return ThinkingLevel.LOW;
    case "medium":
      return ThinkingLevel.MEDIUM;
    case "high":
      return ThinkingLevel.HIGH;
    default:
      return undefined;
  }
}

export type GeminiProviderConfig =
  | { apiKey: string; model: string; timeout?: number }
  // TODO: Vertex 경로는 아직 env 배선이 없어 미검증 — 구조만 남겨두고 실제 자격증명·라우팅 연결은 후속.
  | {
      vertexai: true;
      project: string;
      location: string;
      model: string;
      timeout?: number;
    }
  | { client: GoogleGenAI; model: string };

export const DEFAULT_TIMEOUT_MS = 30_000;

// Gemini는 max_tokens가 필수는 아니지만, 초안 작성 같은 긴 출력이 잘리지 않게 넉넉히 잡는다.
const GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

// HTTP 상태코드 → LlmError 매핑 기준값.
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

// finishReason은 문자열 enum이라 런타임 import 없이 값으로 비교한다.
const FINISH_REASON_MAX_TOKENS = "MAX_TOKENS";
const FINISH_REASON_SAFETY = "SAFETY";
// SAFETY 외의 차단 계열 — 콘텐츠 정책상 결정적으로 막힌 응답이라 재시도해도 동일하다.
// content_filter(비재시도)로 매핑하지 않으면 unknown "no content"로 빠져 워커가 3회 헛돈다.
const FINISH_REASON_BLOCKED = new Set([
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
]);

export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(config: GeminiProviderConfig) {
    if ("client" in config) {
      this.client = config.client;
    } else if ("vertexai" in config) {
      // TODO: Vertex 경로는 미검증. 현재는 형태만 유지하고 실제 사용은 후속에서 연다.
      this.client = new GoogleGenAI({
        vertexai: true,
        project: config.project,
        location: config.location,
        httpOptions: { timeout: config.timeout ?? DEFAULT_TIMEOUT_MS },
      });
    } else {
      if (!config.apiKey) {
        throw new LlmError("auth", "GEMINI_API_KEY is required");
      }
      this.client = new GoogleGenAI({
        apiKey: config.apiKey,
        httpOptions: { timeout: config.timeout ?? DEFAULT_TIMEOUT_MS },
      });
    }
    this.model = config.model;
  }

  async *generateStream(params: GenerateStreamParams): AsyncIterable<string> {
    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: this.toContents(params.messages),
        config: this.toConfig(params),
      });

      for await (const chunk of stream) {
        if (params.signal?.aborted) {
          return;
        }
        const text = chunk.text;
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      if (params.signal?.aborted) {
        return;
      }
      throw this.mapError(error);
    }
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(params.messages),
        config: {
          ...this.toConfig(params),
          responseMimeType: "application/json",
          // responseJsonSchema는 unknown 타입이라 z.toJSONSchema 결과를 캐스팅 없이 받는다.
          responseJsonSchema: z.toJSONSchema(params.schema),
        },
      });

      this.assertNotBlocked(response);

      const text = response.text;
      if (!text) {
        throw new LlmError("unknown", "LLM returned no content");
      }

      const parsed = parseJson(text);
      const result = params.schema.safeParse(parsed);
      if (!result.success) {
        throw new LlmError(
          "unknown",
          `LLM response failed schema validation: ${result.error.message}`,
        );
      }
      return result.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(params.messages),
        config: this.toConfig(params),
      });

      this.assertNotBlocked(response);

      const text = response.text;
      if (!text) {
        throw new LlmError("unknown", "LLM returned no content");
      }
      return text;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private toConfig(params: GenerateTextParams): GenerateContentConfig {
    const thinkingLevel = toThinkingLevel(params.effort);
    return {
      systemInstruction: params.systemPrompt,
      temperature: params.temperature,
      maxOutputTokens: GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
      abortSignal: params.signal,
      httpOptions: this.httpOptions(params),
      // effort가 있으면 thinking_level로 사고량을 조절한다(3.x). 없으면 미설정(동작 불변).
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
    };
  }

  // SDK에 명시적 undefined가 새지 않도록 정의된 키만 담는다. 둘 다 미지정이면
  // httpOptions 자체를 생략해 클라이언트 기본값(생성자 timeout)이 그대로 살게 한다.
  private httpOptions(
    params: Pick<GenerateTextParams, "timeoutMs" | "maxRetries">,
  ): GenerateContentConfig["httpOptions"] {
    if (params.timeoutMs == null && params.maxRetries == null) {
      return undefined;
    }
    const httpOptions: NonNullable<GenerateContentConfig["httpOptions"]> = {};
    if (params.timeoutMs != null) {
      httpOptions.timeout = params.timeoutMs;
    }
    if (params.maxRetries != null) {
      // attempts는 원요청 포함 총 시도 횟수라 maxRetries+1로 환산한다.
      httpOptions.retryOptions = { attempts: params.maxRetries + 1 };
    }
    return httpOptions;
  }

  private toContents(messages: LlmMessage[]): Content[] {
    return messages.map((message) => ({
      // Gemini는 assistant 역할을 "model"로 표기한다.
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  }

  private assertNotBlocked(response: GenerateContentResponse): void {
    // 프롬프트 단계 차단(promptFeedback.blockReason)은 후보가 아예 안 생긴다.
    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new LlmError(
        "content_filter",
        `LLM blocked the prompt (blockReason: ${blockReason})`,
      );
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === FINISH_REASON_MAX_TOKENS) {
      throw new LlmError(
        "unknown",
        "LLM response was truncated (finishReason: MAX_TOKENS)",
      );
    }
    if (finishReason === FINISH_REASON_SAFETY) {
      throw new LlmError(
        "content_filter",
        "LLM response was blocked by safety filter",
      );
    }
    if (finishReason && FINISH_REASON_BLOCKED.has(finishReason)) {
      throw new LlmError(
        "content_filter",
        `LLM response was blocked (finishReason: ${finishReason})`,
      );
    }
    // 후보가 비어 있고 차단 사유도 안 잡혔으면 호출부의 "no content" 경로가 받는다.
    if (!response.candidates || response.candidates.length === 0) {
      throw new LlmError(
        "content_filter",
        "LLM returned no candidates (likely blocked)",
      );
    }
  }

  private mapError(error: unknown): LlmError {
    if (error instanceof LlmError) {
      return error;
    }
    // SDK는 httpOptions.timeout을 abortController.abort()로 구현하므로, 사용자 취소가
    // 아닌데도 여기까지 온 AbortError는 곧 타임아웃이다(취소 경로는 호출부에서
    // signal.aborted 가드로 이미 걸러진 뒤다). "Request timed out" 문구도 함께 본다.
    if (isTimeoutError(error)) {
      return new LlmError("timeout", "LLM request timed out", error);
    }
    const status = httpStatusOf(error);
    if (status === HTTP_TOO_MANY_REQUESTS) {
      return new LlmError("rate_limit", "LLM rate limit exceeded", error);
    }
    if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
      return new LlmError("auth", "LLM authentication failed", error);
    }
    if (status === HTTP_BAD_REQUEST) {
      return new LlmError(
        "bad_request",
        error instanceof Error ? error.message : "Bad request",
        error,
      );
    }
    return new LlmError(
      "unknown",
      error instanceof Error ? error.message : "Unknown LLM error",
      error,
    );
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new LlmError("unknown", "LLM returned non-JSON content", error);
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("aborted") ||
    error.name.includes("Timeout") ||
    error.message.includes("Request timed out")
  );
}

// @google/genai의 ApiError는 .status를 노출한다(legacy/nextgen 양쪽 동일).
// ApiError 클래스 자체는 export되지만, instanceof는 dual-package(node/web 엔트리)·
// 버전 스큐에서 다른 인스턴스를 잡으면 깨지므로, 구조적으로 .status만 읽는다.
function httpStatusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    const status: unknown = Reflect.get(error, "status");
    if (typeof status === "number") {
      return status;
    }
  }
  return undefined;
}
