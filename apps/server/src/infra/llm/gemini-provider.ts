import { z } from "zod";
import type { GenerateContentResponse } from "@google/genai";
import type { GoogleGenAI } from "@google/genai";

import { LlmError } from "@server/infra/llm/llm-error";
import type {
  GenerateStructuredParams,
  LlmMessage,
  LlmProvider,
} from "@server/infra/llm/llm-provider";

// HTTP 상태코드 → LlmError 매핑 기준값. 테스트도 이 값을 가져다 쓴다(mapError 검증 시
// 상태코드를 다시 하드코딩하지 않도록).
export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_TOO_MANY_REQUESTS = 429;

const FINISH_REASON_MAX_TOKENS = "MAX_TOKENS";
const FINISH_REASON_SAFETY = "SAFETY";
// SAFETY 외의 차단 계열 — 콘텐츠 정책상 결정적으로 막힌 응답이라 재시도해도 동일하다.
const FINISH_REASON_BLOCKED = new Set([
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
]);

export class GeminiProvider implements LlmProvider {
  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string,
  ) {}

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(params.messages),
        config: {
          systemInstruction: params.systemPrompt,
          responseMimeType: "application/json",
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

  private toContents(messages: LlmMessage[]) {
    return messages.map((message) => ({
      role: "user" as const,
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

// @google/genai의 ApiError는 .status를 노출한다. instanceof는 dual-package(node/web
// 엔트리)에서 다른 인스턴스를 잡으면 깨지므로, 구조적으로 .status만 읽는다.
function httpStatusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    const status: unknown = Reflect.get(error, "status");
    if (typeof status === "number") {
      return status;
    }
  }
  return undefined;
}
