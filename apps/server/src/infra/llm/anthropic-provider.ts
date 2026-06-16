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
  private requestOptions(
    params: Pick<GenerateTextParams, "timeoutMs" | "maxRetries">,
  ): { timeout?: number; maxRetries?: number } {
    const options: { timeout?: number; maxRetries?: number } = {};
    if (params.timeoutMs !== undefined) {
      options.timeout = params.timeoutMs;
    }
    if (params.maxRetries !== undefined) {
      options.maxRetries = params.maxRetries;
    }
    return options;
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

  // effort 경로 — adaptive thinking + output_config.effort는 beta messages에만 있다.
  // adaptive thinking과 custom temperature는 충돌하므로 temperature는 싣지 않는다.
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

  // 네이티브 경로 — beta.messages.parse + betaZodOutputFormat.
  // 헬퍼가 zod를 JSON 스키마로 변환하며 구조화출력이 미지원하는 제약
  // (minLength/maximum 등)을 스키마에서 떼어내 description으로 접어, 그런 제약이 붙은
  // 스키마도 컴파일 단계 400 없이 통과한다. raw toJSONSchema를 직접 보내면 그 400이
  // 폴백 신호로 안 잡혀 bad_request로 새던 문제를 헬퍼가 정규화로 막는다.
  private async generateStructuredNative<T>(
    params: GenerateStructuredParams<T>,
  ): Promise<T> {
    // effort가 있으면 adaptive thinking을 켜고 effort로 사고량을 조절한다(format과 같은
    // output_config에 담는다). 없으면 thinking 미설정 = 사고 없음(동작 불변).
    // adaptive thinking은 custom temperature와 충돌하므로 effort일 땐 temperature를 뺀다.
    const effort = toAnthropicEffort(params.effort);
    const format = betaZodOutputFormat(params.schema);
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
    return this.parseWithSchema(params.schema, message.parsed_output);
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
      return text;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // effort 경로 — adaptive thinking + output_config.effort는 beta messages에만 있다.
  // adaptive thinking과 custom temperature는 충돌하므로 temperature는 싣지 않는다.
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
