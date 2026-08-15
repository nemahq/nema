import OpenAI from "openai";
import {
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "openai/error";
import { zodTextFormat } from "openai/helpers/zod";
import type {
  Response,
  ResponseInputItem,
} from "openai/resources/responses/responses";

import { LlmError } from "@server/infra/llm/llm-error";
import type {
  GenerateStructuredParams,
  LlmMessage,
  LlmProvider,
} from "@server/infra/llm/llm-provider";

// schemaName은 호출 파라미터가 아니라 구성값이다 — 이 슬라이스는 인스턴스당 스키마가
// 하나(다이제스트 생성)뿐이라 생성 시점에 고정한다. task가 늘면 그때 호출 파라미터로 옮긴다.
// 호출부(provider.ts)는 객체 리터럴로 넘기고 구조적 타이핑에 기대므로 export하지 않는다.
type OpenAiProviderConfig =
  | { apiKey: string; model: string; schemaName: string; timeout?: number }
  | { client: OpenAI; model: string; schemaName: string };

const DEFAULT_TIMEOUT_MS = 30_000;

// 추론 모델은 출력 예산이 너무 작으면 사고 토큰만 쓰고 status "incomplete"로 끝난다.
// Gemini 어댑터와 같은 상한으로 맞춰 긴 초안이 잘리지 않게 넉넉히 잡는다.
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

export class OpenAiProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly schemaName: string;

  constructor(config: OpenAiProviderConfig) {
    if ("client" in config) {
      this.client = config.client;
    } else {
      if (!config.apiKey) {
        throw new LlmError("auth", "OPENAI_API_KEY is required");
      }
      this.client = new OpenAI({
        apiKey: config.apiKey,
        timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
      });
    }
    this.model = config.model;
    this.schemaName = config.schemaName;
  }

  private toInput(messages: LlmMessage[]): ResponseInputItem[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: params.systemPrompt,
        input: this.toInput(params.messages),
        max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        // Responses API는 store 기본값이 true라 응답을 OpenAI에 ~30일 보관한다.
        // previous_response_id를 안 쓰므로 보관 이득이 없어 명시적으로 끈다.
        store: false,
        text: { format: zodTextFormat(params.schema, this.schemaName) },
      });

      this.assertComplete(response.status, response.incomplete_details?.reason);

      const refusal = this.findRefusal(response.output);
      if (refusal != null) {
        throw new LlmError("unknown", `LLM refused the request: ${refusal}`);
      }

      const parsed = response.output_parsed;
      if (parsed == null) {
        throw new LlmError("unknown", "LLM returned no parseable response");
      }

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

  // status가 incomplete면 사유에 따라 truncation/content_filter LlmError로 변환
  private assertComplete(
    status: string | undefined,
    reason: string | undefined,
  ): void {
    if (status !== "incomplete") {
      return;
    }
    if (reason === "max_output_tokens") {
      throw new LlmError(
        "unknown",
        "LLM response was truncated (incomplete: max_output_tokens)",
      );
    }
    if (reason === "content_filter") {
      throw new LlmError(
        "content_filter",
        "LLM response was blocked by content filter",
      );
    }
    throw new LlmError(
      "unknown",
      `LLM response was incomplete (reason: ${reason ?? "unknown"})`,
    );
  }

  // refusal은 top-level이 아니라 message 블록의 content[] 파트에 중첩돼 있어 훑어야 한다.
  private findRefusal(output: Response["output"]): string | null {
    for (const outputItem of output) {
      if (outputItem.type !== "message" || !Array.isArray(outputItem.content)) {
        continue;
      }
      for (const part of outputItem.content) {
        if (
          typeof part === "object" &&
          part != null &&
          "type" in part &&
          part.type === "refusal" &&
          "refusal" in part &&
          typeof part.refusal === "string"
        ) {
          return part.refusal;
        }
      }
    }
    return null;
  }

  private mapError(error: unknown): LlmError {
    if (error instanceof LlmError) {
      return error;
    }
    if (error instanceof APIConnectionTimeoutError) {
      return new LlmError("timeout", "LLM request timed out", error);
    }
    if (error instanceof RateLimitError) {
      return new LlmError("rate_limit", "LLM rate limit exceeded", error);
    }
    if (
      error instanceof AuthenticationError ||
      error instanceof PermissionDeniedError
    ) {
      return new LlmError("auth", "LLM authentication failed", error);
    }
    if (
      error instanceof BadRequestError ||
      error instanceof UnprocessableEntityError
    ) {
      return new LlmError("bad_request", error.message, error);
    }
    return new LlmError(
      "unknown",
      error instanceof Error ? error.message : "Unknown LLM error",
      error,
    );
  }
}
