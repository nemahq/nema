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
import type { GenerateStructuredParams, LlmProvider } from "./llm-provider";

export interface OpenAiProviderConfig {
  apiKey: string;
  model?: string;
  timeout?: number;
}

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenAiProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: OpenAiProviderConfig) {
    if (!config.apiKey) {
      throw new LlmError("auth", "OPENAI_API_KEY is required");
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
    });
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    const model = params.model ?? this.model;

    try {
      const completion = await this.client.chat.completions.parse({
        model,
        temperature: params.temperature,
        messages: [
          { role: "system" as const, content: params.systemPrompt },
          ...params.messages,
        ],
        response_format: zodResponseFormat(params.schema, params.schemaName),
      });

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
      if (error instanceof LlmError) {
        throw error;
      }
      if (error instanceof APIConnectionTimeoutError) {
        throw new LlmError("timeout", "LLM request timed out", error);
      }
      if (error instanceof RateLimitError) {
        throw new LlmError("rate_limit", "LLM rate limit exceeded", error);
      }
      if (
        error instanceof AuthenticationError ||
        error instanceof PermissionDeniedError
      ) {
        throw new LlmError("auth", "LLM authentication failed", error);
      }
      if (
        error instanceof BadRequestError ||
        error instanceof UnprocessableEntityError
      ) {
        throw new LlmError("bad_request", error.message, error);
      }
      throw new LlmError(
        "unknown",
        error instanceof Error ? error.message : "Unknown LLM error",
        error,
      );
    }
  }
}
