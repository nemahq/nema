import { z } from "zod";
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
} from "@google/genai";
import { GoogleGenAI } from "@google/genai";

import { LlmError } from "./llm-error";
import type {
  GenerateStreamParams,
  GenerateStructuredParams,
  GenerateTextParams,
  LlmMessage,
  LlmProvider,
} from "./llm-provider";

export type GeminiProviderConfig =
  | { apiKey: string; model: string; timeout?: number }
  // TODO(NEM-140): Vertex 배선은 아직 env가 안 먹여 미검증 표면이다. 구조는 싸게 남겨두되
  // 실제 자격증명·라우팅 연결은 NEM-140에서 한다.
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
      // TODO(NEM-140): Vertex 경로는 미검증. 현재는 형태만 유지하고 실제 사용은 후속에서 연다.
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
    return {
      systemInstruction: params.systemPrompt,
      temperature: params.temperature,
      maxOutputTokens: GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
      abortSignal: params.signal,
      httpOptions:
        params.timeoutMs != null || params.maxRetries != null
          ? {
              timeout: params.timeoutMs,
              // attempts는 원요청 포함 총 시도 횟수라 maxRetries+1로 환산한다.
              retryOptions:
                params.maxRetries != null
                  ? { attempts: params.maxRetries + 1 }
                  : undefined,
            }
          : undefined,
      // computeLevel: Gemini는 reasoning_effort 대응이 없어 일단 무시한다.
      // thinking budget 매핑은 후속(NEM 별건)으로 미룬다.
    };
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
