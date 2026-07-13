import { z } from "zod";
import Anthropic, {
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
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
  AnthropicEffort,
  GenerateStreamParams,
  GenerateStructuredParams,
  GenerateTextParams,
  LlmProvider,
} from "./llm-provider";

// Claude가 받는 effort만 추려낸다. 바인딩이 프로바이더에 맞는 값만 주입하지만,
// 그 외 값은 안전망으로 걸러 thinking 설정에서 뺀다.
function toAnthropicEffort(
  effort: GenerateStreamParams["effort"],
): AnthropicEffort | undefined {
  switch (effort) {
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return effort;
    default:
      return undefined;
  }
}

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
// 맞으면 tool_use로 폴백한다. 미지원 모델/베타 전용 안전망이다 —
// 스키마 제약(minLength 등)發 400은 betaZodOutputFormat 정규화가 애초에 막는다.
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

// 400 메시지가 "이 모델은 adaptive thinking 능력 자체가 없다"는 신호인지 본다(예: haiku).
// 맞으면 effort 경로가 thinking 없이 폴백한다 — thinking 무지원 모델도 측정·운영되게.
// 예산·크레딧·플랜 한도發 400은 능력 미지원이 아니다(폴백으로 삼키면 다운그레이드를 숨긴다) —
// 좁게 잡아 그런 400은 그대로 에러로 올린다.
function isThinkingUnsupportedError(error: BadRequestError): boolean {
  const message = error.message.toLowerCase();
  if (!message.includes("thinking")) {
    return false;
  }
  const isBudgetOrEntitlement =
    message.includes("budget") ||
    message.includes("credit") ||
    message.includes("billing") ||
    message.includes("quota") ||
    message.includes("plan") ||
    message.includes("exceed") ||
    message.includes("limit");
  if (isBudgetOrEntitlement) {
    return false;
  }
  return (
    message.includes("not support") ||
    message.includes("does not support") ||
    message.includes("unsupported") ||
    message.includes("not available") ||
    message.includes("not enabled")
  );
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

  // SDK가 명시적 undefined timeout/maxRetries를 거부할 수 있어 정의된 옵션만 담아 전달.
  // 운영 호출부(초안/세션)는 timeoutMs를 안 넘기므로 빈 옵션이 정상 경로다.
  // signal을 SDK 요청 옵션으로 내려야 비스트리밍 호출(generateStructured)의 HTTP 요청이
  // 실제로 끊긴다 — 스트리밍 루프의 aborted 가드엔 그런 힘이 없다(openai-provider와 동일).
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

  // 성공한 호출의 토큰 usage를 청구 기준으로 보고한다 — output_tokens가 thinking 포함 청구 총량,
  // thinking_tokens는 그 중 추론 분해다.
  private reportUsage(
    onUsage: GenerateTextParams["onUsage"],
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number | null;
      output_tokens_details?: { thinking_tokens: number } | null;
    },
  ): void {
    if (!onUsage) {
      return;
    }
    onUsage({
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cachedInputTokens: usage.cache_read_input_tokens ?? undefined,
      reasoningTokens: usage.output_tokens_details?.thinking_tokens,
    });
  }

  async *generateStream(params: GenerateStreamParams): AsyncIterable<string> {
    // effort가 있을 때만 adaptive thinking을 켜는 beta 경로로 보낸다. effort 없는
    // streamPlain은 한 바이트도 안 바뀌어 프로덕션 스트리밍 동작이 불변이다.
    const effort = toAnthropicEffort(params.effort);
    if (effort) {
      yield* this.streamWithEffort(params, effort);
      return;
    }
    yield* this.streamPlain(params);
  }

  private async *streamPlain(
    params: GenerateStreamParams,
  ): AsyncIterable<string> {
    try {
      const stream = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          temperature: params.temperature,
          system: params.systemPrompt,
          stream: true,
          messages: this.toMessages(params.messages),
        },
        this.requestOptions(params),
      );

      let inputTokens = 0;
      let cacheReadTokens: number | null | undefined;
      let outputTokens = 0;
      let thinkingTokens: number | undefined;
      for await (const event of stream) {
        if (params.signal?.aborted) {
          stream.controller.abort();
          return;
        }
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
          cacheReadTokens = event.message.usage.cache_read_input_tokens;
        }
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
        // message_delta가 stop_reason과 누적 usage를 싣고 온다. 잘림(max_tokens)·거절(refusal)을
        // 비스트리밍 경로와 같은 LlmError로 끊어야 호출부가 일관되게 처리한다.
        if (event.type === "message_delta") {
          outputTokens = event.usage.output_tokens;
          thinkingTokens = event.usage.output_tokens_details?.thinking_tokens;
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
      this.reportUsage(params.onUsage, {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: cacheReadTokens,
        output_tokens_details:
          thinkingTokens === undefined
            ? null
            : { thinking_tokens: thinkingTokens },
      });
    } catch (error) {
      if (params.signal?.aborted) {
        return;
      }
      throw this.mapError(error);
    }
  }

  // effort 경로 — adaptive thinking·effort는 beta messages 전용이라 분리. temperature는 충돌로 생략.
  private async *streamWithEffort(
    params: GenerateStreamParams,
    effort: AnthropicEffort,
  ): AsyncIterable<string> {
    try {
      const stream = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          system: params.systemPrompt,
          stream: true,
          messages: this.toMessages(params.messages),
          thinking: { type: "adaptive" },
          output_config: { effort },
        },
        this.requestOptions(params),
      );

      let inputTokens = 0;
      let cacheReadTokens: number | null | undefined;
      let outputTokens = 0;
      let thinkingTokens: number | undefined;
      for await (const event of stream) {
        if (params.signal?.aborted) {
          stream.controller.abort();
          return;
        }
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
          cacheReadTokens = event.message.usage.cache_read_input_tokens;
        }
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
        if (event.type === "message_delta") {
          outputTokens = event.usage.output_tokens;
          thinkingTokens = event.usage.output_tokens_details?.thinking_tokens;
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
      this.reportUsage(params.onUsage, {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: cacheReadTokens,
        output_tokens_details:
          thinkingTokens === undefined
            ? null
            : { thinking_tokens: thinkingTokens },
      });
    } catch (error) {
      if (params.signal?.aborted) {
        return;
      }
      // thinking 무지원 모델(예: haiku)은 thinking 없는 streamPlain으로 폴백한다.
      if (
        error instanceof BadRequestError &&
        isThinkingUnsupportedError(error)
      ) {
        yield* this.streamPlain(params);
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

  // 네이티브 경로 — beta.messages.parse + betaZodOutputFormat.
  // 헬퍼가 zod를 JSON 스키마로 변환하며 구조화출력이 미지원하는 제약
  // (minLength/maximum 등)을 스키마에서 떼어내 description으로 접어, 그런 제약이 붙은
  // 스키마도 컴파일 단계 400 없이 통과한다. raw toJSONSchema를 직접 보내면 그 400이
  // 폴백 신호로 안 잡혀 bad_request로 새던 문제를 헬퍼가 정규화로 막는다.
  private async generateStructuredNative<T>(
    params: GenerateStructuredParams<T>,
    allowThinking = true,
  ): Promise<T> {
    // effort가 있으면 adaptive thinking을 켜고 effort로 사고량을 조절한다(format과 같은
    // output_config에 담는다). 없으면 thinking 미설정 = 사고 없음(동작 불변).
    // adaptive thinking은 custom temperature와 충돌하므로 effort일 땐 temperature를 뺀다.
    const effort = allowThinking ? toAnthropicEffort(params.effort) : undefined;
    const format = betaZodOutputFormat(params.schema);
    try {
      const message = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          temperature: effort ? undefined : params.temperature,
          system: params.systemPrompt,
          messages: this.toMessages(params.messages),
          betas: [STRUCTURED_OUTPUTS_BETA],
          ...(effort ? { thinking: { type: "adaptive" as const } } : {}),
          output_config: effort ? { format, effort } : { format },
        },
        this.requestOptions(params),
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

      // 헬퍼가 parsed_output을 이미 zod로 파싱하지만, SDK 출력을 그대로 믿지 않고
      // 우리 스키마로 한 번 더 좁힌다(as 금지 규약 + 방어). null이면 본문이 비었다는 뜻.
      if (message.parsed_output == null) {
        throw new LlmError("unknown", "LLM returned no content");
      }
      this.reportUsage(params.onUsage, message.usage);
      return this.parseWithSchema(params.schema, message.parsed_output);
    } catch (error) {
      // thinking 무지원 모델(예: haiku)은 effort만 떨궈 thinking 없이 한 번 재시도한다.
      // 그 외 오류는 그대로 올려 generateStructured의 tool_use 폴백 판정을 거치게 한다.
      if (
        effort &&
        error instanceof BadRequestError &&
        isThinkingUnsupportedError(error)
      ) {
        return this.generateStructuredNative(params, false);
      }
      throw error;
    }
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
        this.requestOptions(params),
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

      this.reportUsage(params.onUsage, message.usage);
      return this.parseWithSchema(params.schema, toolUse.input);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    // effort가 있으면 adaptive thinking을 켜는 beta 경로로. 없으면 현행 그대로(동작 불변).
    const effort = toAnthropicEffort(params.effort);
    if (effort) {
      return this.generateTextWithEffort(params, effort);
    }
    return this.generateTextPlain(params);
  }

  // thinking 없는 일반 경로 — no-effort 호출과 effort 경로의 thinking 폴백이 공유한다.
  private async generateTextPlain(params: GenerateTextParams): Promise<string> {
    try {
      const message = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          temperature: params.temperature,
          system: params.systemPrompt,
          messages: this.toMessages(params.messages),
        },
        this.requestOptions(params),
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
        .filter(isTextBlock)
        .map((block) => block.text)
        .join("");
      if (!text) {
        throw new LlmError("unknown", "LLM returned no content");
      }
      this.reportUsage(params.onUsage, message.usage);
      return text;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // effort 경로 — streamWithEffort와 동형(beta 전용 adaptive thinking, temperature 생략).
  private async generateTextWithEffort(
    params: GenerateTextParams,
    effort: AnthropicEffort,
  ): Promise<string> {
    try {
      const message = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          system: params.systemPrompt,
          messages: this.toMessages(params.messages),
          thinking: { type: "adaptive" },
          output_config: { effort },
        },
        this.requestOptions(params),
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

      // beta 응답 블록 — thinking 블록은 건너뛰고 text만 모은다(구조적으로 좁힌다).
      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      if (!text) {
        throw new LlmError("unknown", "LLM returned no content");
      }
      this.reportUsage(params.onUsage, message.usage);
      return text;
    } catch (error) {
      // thinking 무지원 모델(예: haiku)은 thinking 없는 plain text로 폴백한다.
      if (
        error instanceof BadRequestError &&
        isThinkingUnsupportedError(error)
      ) {
        return this.generateTextPlain(params);
      }
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
