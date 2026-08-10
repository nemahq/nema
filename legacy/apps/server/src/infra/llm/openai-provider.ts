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

import { LlmError } from "./llm-error";
import type {
  GenerateStreamParams,
  GenerateStructuredParams,
  GenerateTextParams,
  LlmProvider,
  OpenAiEffort,
} from "./llm-provider";

export type OpenAiProviderConfig =
  | { apiKey: string; model: string; timeout?: number }
  | { client: OpenAI; model: string };

export const DEFAULT_TIMEOUT_MS = 30_000;

// 추론 모델은 출력 예산이 너무 작으면 사고 토큰만 쓰고 status "incomplete"로 끝난다.
// Claude/Gemini 어댑터와 같은 상한으로 맞춰 긴 초안이 잘리지 않게 넉넉히 잡는다.
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

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

  // messages(user/assistant)를 Responses API input 배열로 매핑. system은 instructions로 분리 전달
  private toInput(
    messages: GenerateTextParams["messages"],
  ): ResponseInputItem[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  // OpenAI가 받는 effort만 reasoning.effort로 넘긴다. 바인딩이 프로바이더에 맞는 값만
  // 주입하므로, 그 외 값(예: Claude의 xhigh)은 안전망으로 무시한다.
  private reasoning(
    effort: GenerateTextParams["effort"],
  ): { effort: OpenAiEffort } | undefined {
    switch (effort) {
      case "minimal":
      case "low":
      case "medium":
      case "high":
        return { effort };
      default:
        return undefined;
    }
  }

  // SDK가 명시적 undefined timeout/maxRetries를 거부하므로 정의된 옵션만 담아 전달
  // signal은 SDK 요청 옵션으로 내려야 실제로 HTTP 요청이 끊긴다 — 스트리밍 루프의
  // aborted 가드는 이미 받은 청크를 그만 읽을 뿐이라, 비스트리밍 호출(generateStructured)엔
  // 그런 루프조차 없어 취소가 아무것도 안 끊는다(콜은 끝까지 돌고 토큰을 태운다).
  private requestOptions(
    params: Pick<GenerateTextParams, "timeoutMs" | "maxRetries" | "signal">,
  ): { timeout?: number; maxRetries?: number; signal?: AbortSignal } {
    const options: {
      timeout?: number;
      maxRetries?: number;
      signal?: AbortSignal;
    } = {};
    if (params.timeoutMs !== undefined) {
      options.timeout = params.timeoutMs;
    }
    if (params.maxRetries !== undefined) {
      options.maxRetries = params.maxRetries;
    }
    if (params.signal !== undefined) {
      options.signal = params.signal;
    }
    return options;
  }

  // 성공한 호출의 토큰 usage를 청구 기준으로 보고한다 — output_tokens엔 reasoning이 이미 포함된다.
  private emitUsage(
    onUsage: GenerateTextParams["onUsage"],
    usage: Response["usage"],
  ): void {
    if (!onUsage || !usage) {
      return;
    }
    onUsage({
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cachedInputTokens: usage.input_tokens_details.cached_tokens,
      reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    });
  }

  async *generateStream(params: GenerateStreamParams): AsyncIterable<string> {
    try {
      const stream = await this.client.responses.create(
        {
          model: this.model,
          instructions: params.systemPrompt,
          input: this.toInput(params.messages),
          temperature: params.temperature,
          reasoning: this.reasoning(params.effort),
          max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
          // Responses API는 store 기본값이 true라 응답을 OpenAI에 ~30일 보관한다.
          // previous_response_id를 안 쓰므로 보관 이득이 없어 명시적으로 끈다.
          store: false,
          stream: true,
        },
        this.requestOptions(params),
      );

      // 종료 이벤트(response.completed/incomplete)가 싣고 오는 최종 응답을 잡아둔다.
      // 루프 후 비스트리밍 경로와 같은 truncation/refusal 검사를 돌리기 위함.
      let finalResponse: Response | undefined;
      for await (const event of stream) {
        if (params.signal?.aborted) {
          stream.controller.abort();
          return;
        }
        if (event.type === "response.output_text.delta") {
          yield event.delta;
        }
        if (
          event.type === "response.completed" ||
          event.type === "response.incomplete"
        ) {
          finalResponse = event.response;
        }
      }

      // 취소 경로는 위 가드에서 이미 빠졌다. 정상 종료한 스트림만 최종 상태를 검사해
      // 잘림(incomplete)·콘텐츠 필터·거절을 비스트리밍 경로와 같은 LlmError로 끊는다.
      if (finalResponse != null) {
        this.assertComplete(
          finalResponse.status,
          finalResponse.incomplete_details?.reason,
        );
        const refusal = this.findRefusal(finalResponse.output);
        if (refusal != null) {
          throw new LlmError("unknown", `LLM refused the request: ${refusal}`);
        }
        this.emitUsage(params.onUsage, finalResponse.usage);
      }
    } catch (error) {
      if (params.signal?.aborted) {
        return;
      }
      throw this.mapError(error, params.signal);
    }
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    try {
      const response = await this.client.responses.parse(
        {
          model: this.model,
          instructions: params.systemPrompt,
          input: this.toInput(params.messages),
          temperature: params.temperature,
          reasoning: this.reasoning(params.effort),
          max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
          // Responses API는 store 기본값이 true(응답 ~30일 보관). 우리는 안 쓰므로 끈다.
          store: false,
          text: { format: zodTextFormat(params.schema, params.schemaName) },
        },
        this.requestOptions(params),
      );

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
      this.emitUsage(params.onUsage, response.usage);
      return result.data;
    } catch (error) {
      throw this.mapError(error, params.signal);
    }
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    try {
      const response = await this.client.responses.create(
        {
          model: this.model,
          instructions: params.systemPrompt,
          input: this.toInput(params.messages),
          temperature: params.temperature,
          reasoning: this.reasoning(params.effort),
          max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
          // Responses API는 store 기본값이 true(응답 ~30일 보관). 우리는 안 쓰므로 끈다.
          store: false,
        },
        this.requestOptions(params),
      );

      this.assertComplete(response.status, response.incomplete_details?.reason);

      const content = response.output_text;
      if (!content) {
        throw new LlmError("unknown", "LLM returned no content");
      }
      this.emitUsage(params.onUsage, response.usage);
      return content;
    } catch (error) {
      throw this.mapError(error, params.signal);
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
  private findRefusal(
    output: Array<{ type: string; content?: unknown }>,
  ): string | null {
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

  // abort 판정이 맨 앞에 온다 — SDK가 abort를 어떤 예외로 던지는지에 기대지 않고 signal만
  // 본다. 이게 뒤로 밀리면 취소가 "unknown"으로 분류되고, 워커의 재시도 정책이 unknown을
  // 재시도 대상에 넣고 있어 방금 사람이 취소한 작업을 다시 부른다. 취소를 실패로 안 보는
  // 책임을 호출부 규율이 아니라 provider 레이어가 진다.
  private mapError(error: unknown, signal?: AbortSignal): LlmError {
    if (error instanceof LlmError) {
      return error;
    }
    if (signal?.aborted) {
      return new LlmError(
        "aborted",
        "LLM call was aborted by the caller",
        error,
      );
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
