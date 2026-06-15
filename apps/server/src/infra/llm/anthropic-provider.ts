import { z } from "zod";
import Anthropic, {
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
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

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
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

      const result = params.schema.safeParse(toolUse.input);
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

  private toInputSchema<T>(
    schema: GenerateStructuredParams<T>["schema"],
  ): Tool.InputSchema {
    const jsonSchema = z.toJSONSchema(schema);
    return { ...jsonSchema, type: "object" };
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
