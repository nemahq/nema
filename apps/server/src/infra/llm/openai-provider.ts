import OpenAI from "openai";
import {
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "openai/error";
import { zodResponseFormat } from "openai/helpers/zod";

import { LlmError } from "./llm-error";
import type {
  GenerateStreamParams,
  GenerateStructuredParams,
  GenerateTextParams,
  LlmProvider,
} from "./llm-provider";

export type OpenAiProviderConfig =
  | { apiKey: string; model: string; timeout?: number }
  | { client: OpenAI; model: string };

export const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenAiProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly model: string;

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
  }

  async *generateStream(params: GenerateStreamParams): AsyncIterable<string> {
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          temperature: params.temperature,
          reasoning_effort: params.computeLevel,
          stream: true,
          messages: [
            { role: "system" as const, content: params.systemPrompt },
            ...params.messages,
          ],
        },
        { timeout: params.timeoutMs, maxRetries: params.maxRetries },
      );

      for await (const chunk of stream) {
        if (params.signal?.aborted) {
          stream.controller.abort();
          return;
        }
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
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
      const completion = await this.client.chat.completions.parse(
        {
          model: this.model,
          temperature: params.temperature,
          reasoning_effort: params.computeLevel,
          messages: [
            { role: "system" as const, content: params.systemPrompt },
            ...params.messages,
          ],
          response_format: zodResponseFormat(params.schema, params.schemaName),
        },
        { timeout: params.timeoutMs, maxRetries: params.maxRetries },
      );

      const choice = completion.choices[0];
      if (!choice) {
        throw new LlmError("unknown", "LLM returned no choices");
      }
      if (choice.finish_reason === "length") {
        throw new LlmError(
          "unknown",
          "LLM response was truncated (finish_reason: length)",
        );
      }
      if (choice.finish_reason === "content_filter") {
        throw new LlmError(
          "content_filter",
          "LLM response was blocked by content filter",
        );
      }
      if (choice.message?.refusal) {
        throw new LlmError(
          "unknown",
          `LLM refused the request: ${choice.message.refusal}`,
        );
      }
      const parsed = choice.message?.parsed;
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

  async generateText(params: GenerateTextParams): Promise<string> {
    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.model,
          temperature: params.temperature,
          reasoning_effort: params.computeLevel,
          messages: [
            { role: "system" as const, content: params.systemPrompt },
            ...params.messages,
          ],
        },
        { timeout: params.timeoutMs, maxRetries: params.maxRetries },
      );

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new LlmError("unknown", "LLM returned no content");
      }
      return content;
    } catch (error) {
      throw this.mapError(error);
    }
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
