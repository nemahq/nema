import { z } from "zod";
import Anthropic, {
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta";
import type {
  ContentBlock,
  MessageParam,
  TextBlock,
  Tool,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

import { LlmError } from "./llm-error";
import type {
  GenerateStreamParams,
  GenerateStructuredParams,
  GenerateTextParams,
  LlmProvider,
} from "./llm-provider";

export type AnthropicProviderConfig =
  | { apiKey: string; model: string; timeout?: number }
  | { client: Anthropic; model: string };

export const DEFAULT_TIMEOUT_MS = 30_000;

// Anthropic은 max_tokens가 필수다. 초안 작성 같은 긴 출력을 잘리지 않게 넉넉히 잡는다.
const ANTHROPIC_DEFAULT_MAX_TOKENS = 16_384;

// 네이티브 구조화 출력(constrained decoding) 공개 베타 헤더.
// SDK의 AnthropicBeta는 (string & {}) 유니온이라 리터럴이 그대로 통과한다.
const STRUCTURED_OUTPUTS_BETA: AnthropicBeta = "structured-outputs-2025-11-13";

// 네이티브 구조화 출력을 지원하지 않는 모델은 강제 tool_use 경로로 폴백한다.
// 카탈로그 3개 모델(opus-4-8·sonnet-4-6·haiku-4-5)은 라이브로 네이티브 지원을 확인했다.
// 빈 set = 전 카탈로그 모델이 네이티브 사용. 런타임 폴백은 미래/미식별 모델용 안전망.
const NATIVE_STRUCTURED_OUTPUT_UNSUPPORTED = new Set<string>();

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

// 400 메시지가 "이 모델/베타는 구조화 출력을 못 받는다"는 신호인지 본다.
// 맞으면 tool_use로 폴백, 아니면(스키마 오류 등) 그대로 올린다.
// 결제·인증 같은 다른 400을 폴백으로 삼키지 않도록 표현을 좁게 잡는다.
function isNativeUnsupportedError(error: BadRequestError): boolean {
  const message = error.message.toLowerCase();
  const mentionsStructured =
    message.includes("structured output") ||
    message.includes("output_config") ||
    message.includes("output_format") ||
    message.includes("structured-outputs-2025-11-13");
  const mentionsUnsupported =
    message.includes("not support") ||
    message.includes("unsupported") ||
    message.includes("does not support") ||
    message.includes("not available") ||
    message.includes("not enabled");
  return mentionsStructured && mentionsUnsupported;
}

export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: AnthropicProviderConfig) {
    if ("client" in config) {
      this.client = config.client;
    } else {
      if (!config.apiKey) {
        throw new LlmError("auth", "ANTHROPIC_API_KEY is required");
      }
      this.client = new Anthropic({
        apiKey: config.apiKey,
        timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
      });
    }
    this.model = config.model;
  }

  async *generateStream(params: GenerateStreamParams): AsyncIterable<string> {
    try {
      const stream = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          temperature: params.temperature,
          system: params.systemPrompt,
          stream: true,
          messages: this.toMessages(params.messages),
          // computeLevel: Claude엔 reasoning_effort 대응이 없어 일단 무시한다.
          // extended thinking 매핑은 후속(NEM 별건)으로 미룬다.
        },
        { timeout: params.timeoutMs, maxRetries: params.maxRetries },
      );

      for await (const event of stream) {
        if (params.signal?.aborted) {
          stream.controller.abort();
          return;
        }
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
        // message_delta가 stop_reason을 싣고 온다. 잘림(max_tokens)·거절(refusal)을
        // 비스트리밍 경로와 같은 LlmError로 끊어야 호출부가 일관되게 처리한다.
        if (event.type === "message_delta") {
          const stopReason = event.delta.stop_reason;
          if (stopReason === "max_tokens") {
            throw new LlmError(
              "unknown",
              "LLM response was truncated (stop_reason: max_tokens)",
            );
          }
          if (stopReason === "refusal") {
            throw new LlmError("unknown", "LLM refused the request");
          }
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
    // 네이티브 구조화 출력(constrained decoding)이 Anthropic 권장 경로다.
    // 강제 tool_use는 워크어라운드였고, 미지원 모델만 폴백으로 남긴다.
    if (NATIVE_STRUCTURED_OUTPUT_UNSUPPORTED.has(this.model)) {
      return this.generateStructuredViaToolUse(params);
    }
    try {
      return await this.generateStructuredNative(params);
    } catch (error) {
      // 모델/계정이 네이티브 베타를 못 받으면 런타임에 tool_use로 넘어가
      // 모든 카탈로그 모델에서 generateStructured가 계속 동작하게 한다.
      if (error instanceof BadRequestError && isNativeUnsupportedError(error)) {
        return this.generateStructuredViaToolUse(params);
      }
      throw this.mapError(error);
    }
  }

  // 네이티브 경로 — output_config.format(json_schema)으로 디코딩을 제약한다.
  // 응답은 첫 text 블록에 스키마를 만족하는 JSON 문자열로 온다.
  private async generateStructuredNative<T>(
    params: GenerateStructuredParams<T>,
  ): Promise<T> {
    const message = await this.client.beta.messages.create(
      {
        model: this.model,
        max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
        temperature: params.temperature,
        system: params.systemPrompt,
        messages: this.toMessages(params.messages),
        betas: [STRUCTURED_OUTPUTS_BETA],
        output_config: {
          format: {
            type: "json_schema",
            schema: this.toJsonSchema(params.schema),
          },
        },
      },
      { timeout: params.timeoutMs, maxRetries: params.maxRetries },
    );

    if (message.stop_reason === "max_tokens") {
      throw new LlmError(
        "unknown",
        "LLM response was truncated (stop_reason: max_tokens)",
      );
    }
    if (message.stop_reason === "refusal") {
      throw new LlmError("unknown", "LLM refused the request");
    }

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    if (!text) {
      throw new LlmError("unknown", "LLM returned no content");
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (cause) {
      throw new LlmError("unknown", "LLM returned non-JSON output", cause);
    }

    return this.parseWithSchema(params.schema, json);
  }

  // 폴백 경로 — 강제 tool_use. 네이티브 미지원 모델에서만 쓰인다.
  private async generateStructuredViaToolUse<T>(
    params: GenerateStructuredParams<T>,
  ): Promise<T> {
    try {
      const message = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          temperature: params.temperature,
          system: params.systemPrompt,
          messages: this.toMessages(params.messages),
          tools: [
            {
              name: params.schemaName,
              input_schema: this.toInputSchema(params.schema),
            },
          ],
          tool_choice: { type: "tool", name: params.schemaName },
        },
        { timeout: params.timeoutMs, maxRetries: params.maxRetries },
      );

      if (message.stop_reason === "max_tokens") {
        throw new LlmError(
          "unknown",
          "LLM response was truncated (stop_reason: max_tokens)",
        );
      }
      if (message.stop_reason === "refusal") {
        throw new LlmError("unknown", "LLM refused the request");
      }

      const toolUse = message.content.find(isToolUseBlock);
      if (!toolUse) {
        throw new LlmError("unknown", "LLM returned no tool_use block");
      }

      return this.parseWithSchema(params.schema, toolUse.input);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    try {
      const message = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          temperature: params.temperature,
          system: params.systemPrompt,
          messages: this.toMessages(params.messages),
        },
        { timeout: params.timeoutMs, maxRetries: params.maxRetries },
      );

      if (message.stop_reason === "max_tokens") {
        throw new LlmError(
          "unknown",
          "LLM response was truncated (stop_reason: max_tokens)",
        );
      }

      const text = message.content
        .filter(isTextBlock)
        .map((block) => block.text)
        .join("");
      if (!text) {
        throw new LlmError("unknown", "LLM returned no content");
      }
      return text;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private toMessages(messages: GenerateTextParams["messages"]): MessageParam[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  // 네이티브 output_config.format에 싣는 JSON 스키마. 최상위 type은 object로 고정.
  private toJsonSchema<T>(
    schema: GenerateStructuredParams<T>["schema"],
  ): Record<string, unknown> {
    return { ...z.toJSONSchema(schema), type: "object" };
  }

  private toInputSchema<T>(
    schema: GenerateStructuredParams<T>["schema"],
  ): Tool.InputSchema {
    const jsonSchema = z.toJSONSchema(schema);
    return { ...jsonSchema, type: "object" };
  }

  // SDK 응답 데이터에 as를 쓰지 않고 schema로만 좁힌다 — 실패 시 typed LlmError.
  private parseWithSchema<T>(
    schema: GenerateStructuredParams<T>["schema"],
    data: unknown,
  ): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new LlmError(
        "unknown",
        `LLM response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
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
    if (error instanceof BadRequestError) {
      return new LlmError("bad_request", error.message, error);
    }
    return new LlmError(
      "unknown",
      error instanceof Error ? error.message : "Unknown LLM error",
      error,
    );
  }
}
