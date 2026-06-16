import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { AnthropicProvider } from "./anthropic-provider";
import { LlmError } from "./llm-error";

// 에러 클래스 named export는 그대로 둔다(instanceof 매핑 검증에 필요).
// 기본 export(클라이언트 생성자)만 막아 실제 네트워크 호출을 차단한다.
vi.mock("@anthropic-ai/sdk", async () => {
  const actual =
    await vi.importActual<typeof import("@anthropic-ai/sdk")>(
      "@anthropic-ai/sdk",
    );
  return { ...actual, default: vi.fn() };
});

const TestSchema = z.object({ answer: z.string() });

function createMockClient() {
  const createFn = vi.fn();
  // 네이티브 구조화 출력은 beta.messages.parse를, effort(adaptive thinking) 경로는
  // beta.messages.create를 탄다.
  const betaParseFn = vi.fn();
  const betaCreateFn = vi.fn();
  const client = {
    messages: { create: createFn },
    beta: { messages: { parse: betaParseFn, create: betaCreateFn } },
  } as unknown as Anthropic;
  return { client, createFn, betaParseFn, betaCreateFn };
}

function mockCreate(response: unknown) {
  const { client, createFn, betaParseFn, betaCreateFn } = createMockClient();
  createFn.mockResolvedValue(response);
  betaParseFn.mockResolvedValue(response);
  betaCreateFn.mockResolvedValue(response);
  const provider = new AnthropicProvider({ client, model: "claude-opus-4-8" });
  return { provider, createFn, betaParseFn, betaCreateFn };
}

function mockCreateRejection(error: Error) {
  const { client, createFn, betaParseFn, betaCreateFn } = createMockClient();
  createFn.mockRejectedValue(error);
  betaParseFn.mockRejectedValue(error);
  betaCreateFn.mockRejectedValue(error);
  const provider = new AnthropicProvider({ client, model: "claude-opus-4-8" });
  return { provider, createFn, betaParseFn, betaCreateFn };
}

describe("AnthropicProvider", () => {
  describe("constructor", () => {
    it("throws LlmError when apiKey is empty", () => {
      expect(
        () => new AnthropicProvider({ apiKey: "", model: "claude-opus-4-8" }),
      ).toThrow(LlmError);
    });
  });

  describe("generateText", () => {
    it("concatenates text blocks on success", async () => {
      const { provider } = mockCreate({
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      });

      const result = await provider.generateText({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(result).toBe("Hello world");
    });

    it("passes correct parameters to the Anthropic SDK", async () => {
      const { provider, createFn } = mockCreate({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "ok" }],
      });

      await provider.generateText({
        systemPrompt: "System prompt.",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
          { role: "user", content: "Question" },
        ],
        temperature: 0.5,
      });

      const callArgs = createFn.mock.calls[0]?.[0];
      expect(callArgs.model).toBe("claude-opus-4-8");
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.system).toBe("System prompt.");
      expect(callArgs.max_tokens).toBe(16_384);
      expect(callArgs.messages).toEqual([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Question" },
      ]);
    });

    it("throws when response is truncated", async () => {
      const { provider } = mockCreate({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "partial" }],
      });

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM response was truncated (stop_reason: max_tokens)",
        }),
      );
    });

    it("throws when there is no text content", async () => {
      const { provider } = mockCreate({
        stop_reason: "end_turn",
        content: [],
      });

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM returned no content",
        }),
      );
    });

    it("routes to the beta path with adaptive thinking + effort when effort is set", async () => {
      const { provider, createFn, betaCreateFn } = mockCreate({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "ok" }],
      });

      const result = await provider.generateText({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        temperature: 0.5,
        effort: "high",
      });

      expect(result).toBe("ok");
      // 비-beta 경로로 새지 않고, beta에 adaptive thinking + effort가 실린다.
      expect(createFn).not.toHaveBeenCalled();
      const callArgs = betaCreateFn.mock.calls[0]?.[0];
      expect(callArgs.thinking).toEqual({ type: "adaptive" });
      expect(callArgs.output_config).toEqual({ effort: "high" });
      // adaptive thinking과 custom temperature 충돌 회피 — temperature는 빠진다.
      expect(callArgs.temperature).toBeUndefined();
    });
  });

  describe("generateStream", () => {
    it("yields text from text_delta events", async () => {
      const events = [
        { type: "content_block_start", content_block: { type: "text" } },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hel" },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "lo" },
        },
        { type: "message_stop" },
      ];
      const stream = {
        controller: { abort: vi.fn() },
        async *[Symbol.asyncIterator]() {
          yield* events;
        },
      };
      const { provider } = mockCreate(stream);

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Hel", "lo"]);
    });

    it("routes streaming through the beta path with adaptive thinking + effort", async () => {
      const events = [
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "hi" },
        },
        { type: "message_stop" },
      ];
      const stream = {
        controller: { abort: vi.fn() },
        async *[Symbol.asyncIterator]() {
          yield* events;
        },
      };
      const { provider, createFn, betaCreateFn } = mockCreate(stream);

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        temperature: 0.5,
        effort: "max",
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["hi"]);
      expect(createFn).not.toHaveBeenCalled();
      const callArgs = betaCreateFn.mock.calls[0]?.[0];
      expect(callArgs.thinking).toEqual({ type: "adaptive" });
      expect(callArgs.output_config).toEqual({ effort: "max" });
      expect(callArgs.stream).toBe(true);
      expect(callArgs.temperature).toBeUndefined();
    });

    it("aborts the stream and stops when signal is aborted", async () => {
      const abort = vi.fn();
      const controller = new AbortController();
      const stream = {
        controller: { abort },
        async *[Symbol.asyncIterator]() {
          controller.abort();
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "should-not-yield" },
          };
        },
      };
      const { provider } = mockCreate(stream);

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        signal: controller.signal,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([]);
      expect(abort).toHaveBeenCalledOnce();
    });

    it("swallows errors when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const { client, createFn } = createMockClient();
      createFn.mockRejectedValue(new Error("aborted"));
      const provider = new AnthropicProvider({
        client,
        model: "claude-opus-4-8",
      });

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        signal: controller.signal,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([]);
    });

    it("throws when stream is truncated by max_tokens (message_delta)", async () => {
      // 실제 SDK의 message_delta가 delta.stop_reason을 싣는 형태를 그대로 흉내낸다.
      const events = [
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "partial" },
        },
        {
          type: "message_delta",
          delta: { stop_reason: "max_tokens", stop_sequence: null },
          usage: { output_tokens: 16_384 },
        },
      ];
      const stream = {
        controller: { abort: vi.fn() },
        async *[Symbol.asyncIterator]() {
          yield* events;
        },
      };
      const { provider } = mockCreate(stream);

      const chunks: string[] = [];
      await expect(
        (async () => {
          for await (const chunk of provider.generateStream({
            systemPrompt: "sys",
            messages: [{ role: "user", content: "q" }],
          })) {
            chunks.push(chunk);
          }
        })(),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM response was truncated (stop_reason: max_tokens)",
        }),
      );
      expect(chunks).toEqual(["partial"]);
    });

    it("throws when stream ends in a refusal (message_delta)", async () => {
      const events = [
        {
          type: "message_delta",
          delta: { stop_reason: "refusal", stop_sequence: null },
          usage: { output_tokens: 1 },
        },
      ];
      const stream = {
        controller: { abort: vi.fn() },
        async *[Symbol.asyncIterator]() {
          yield* events;
        },
      };
      const { provider } = mockCreate(stream);

      const collected: string[] = [];
      await expect(
        (async () => {
          for await (const chunk of provider.generateStream({
            systemPrompt: "sys",
            messages: [{ role: "user", content: "q" }],
          })) {
            collected.push(chunk);
          }
        })(),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM refused the request",
        }),
      );
      expect(collected).toEqual([]);
    });
  });

  describe("generateStructured (native path)", () => {
    // 네이티브 경로는 beta.messages.parse로 betaZodOutputFormat을 보내고,
    // SDK 헬퍼가 본문을 zod로 파싱해 parsed_output에 채워 돌려준다.
    function nativeResponse(payload: unknown, stopReason = "end_turn") {
      return {
        stop_reason: stopReason,
        content: [{ type: "text", text: JSON.stringify(payload) }],
        parsed_output: payload,
      };
    }

    it("returns parsed_output from the native parse helper", async () => {
      const { provider, betaParseFn, createFn } = mockCreate(
        nativeResponse({ answer: "42" }),
      );

      const result = await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "You are a helper.",
        messages: [{ role: "user", content: "What is the answer?" }],
      });

      expect(result).toEqual({ answer: "42" });
      // 네이티브 경로만 호출되고 tool_use 경로(messages.create)는 안 탄다.
      expect(betaParseFn).toHaveBeenCalledOnce();
      expect(createFn).not.toHaveBeenCalled();
    });

    it("sends the structured-outputs beta header and a normalized output format", async () => {
      const { provider, betaParseFn } = mockCreate(
        nativeResponse({ answer: "ok" }),
      );

      await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      });

      const callArgs = betaParseFn.mock.calls[0]?.[0];
      expect(callArgs.betas).toEqual(["structured-outputs-2025-11-13"]);
      // betaZodOutputFormat이 json_schema 포맷 + parse 콜백을 만들어 싣는다.
      expect(callArgs.output_config.format.type).toBe("json_schema");
      expect(callArgs.output_config.format.schema.type).toBe("object");
      expect(typeof callArgs.output_config.format.parse).toBe("function");
      // 강제 tool_use 파라미터가 더는 새지 않아야 한다.
      expect(callArgs.tools).toBeUndefined();
      expect(callArgs.tool_choice).toBeUndefined();
      // effort를 안 넘기면 thinking/effort 미설정(동작 불변).
      expect(callArgs.thinking).toBeUndefined();
      expect(callArgs.output_config.effort).toBeUndefined();
    });

    it("enables adaptive thinking and sends effort on the structured path", async () => {
      const { provider, betaParseFn } = mockCreate(
        nativeResponse({ answer: "ok" }),
      );

      await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        temperature: 0.2,
        effort: "high",
      });

      const callArgs = betaParseFn.mock.calls[0]?.[0];
      expect(callArgs.thinking).toEqual({ type: "adaptive" });
      expect(callArgs.output_config.effort).toBe("high");
      // adaptive thinking은 custom temperature와 충돌하므로 effort일 땐 temperature를 뺀다.
      expect(callArgs.temperature).toBeUndefined();
    });

    it("passes empty request options (no undefined timeout) when timeoutMs is omitted", async () => {
      // 운영 호출부는 timeoutMs를 안 넘긴다. SDK에 {timeout: undefined}가 새지 않고
      // 빈 객체가 가야 한다(생성자 기본 timeout이 그대로 살아남도록).
      const { provider, betaParseFn } = mockCreate(
        nativeResponse({ answer: "x" }),
      );

      await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      });

      const options = betaParseFn.mock.calls[0]?.[1];
      expect(options).toEqual({});
      expect("timeout" in options).toBe(false);
      expect("maxRetries" in options).toBe(false);
    });

    it("normalizes unsupported zod constraints instead of 400-ing (folds into description)", async () => {
      // 구조화출력 미지원 제약(min length)이 붙은 스키마라도 헬퍼가 스키마 키워드에서
      // 떼어내 description으로 접으므로 compile-time 400이 안 나야 한다.
      const ConstrainedSchema = z.object({ answer: z.string().min(3) });
      const { provider, betaParseFn } = mockCreate({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify({ answer: "okay" }) }],
        parsed_output: { answer: "okay" },
      });

      const result = await provider.generateStructured({
        schema: ConstrainedSchema,
        schemaName: "test",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      });

      expect(result).toEqual({ answer: "okay" });
      const schema = betaParseFn.mock.calls[0]?.[0].output_config.format.schema;
      // 제약이 스키마 본문이 아니라 description으로 접혀 들어갔다.
      expect(schema.properties.answer.minLength).toBeUndefined();
    });

    it("throws when truncated by max_tokens", async () => {
      const { provider } = mockCreate(nativeResponse({}, "max_tokens"));

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM response was truncated (stop_reason: max_tokens)",
        }),
      );
    });

    it("throws when model refuses the request", async () => {
      const { provider } = mockCreate({
        stop_reason: "refusal",
        content: [],
        parsed_output: null,
      });

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM refused the request",
        }),
      );
    });

    it("throws when there is no parsed content", async () => {
      const { provider } = mockCreate({
        stop_reason: "end_turn",
        content: [],
        parsed_output: null,
      });

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM returned no content",
        }),
      );
    });

    it("throws when the parsed output fails our schema validation", async () => {
      const { provider } = mockCreate(nativeResponse({ answer: 123 }));

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "unknown" }));
    });
  });

  describe("generateStructured (tool_use fallback)", () => {
    // 네이티브 미지원 신호(400)면 런타임에 tool_use 경로로 폴백한다.
    async function makeNativeUnsupportedError() {
      const { BadRequestError } = await import("@anthropic-ai/sdk");
      return new BadRequestError(
        400,
        {
          error: {
            message: "This model does not support structured outputs",
          },
        },
        "This model does not support structured outputs",
        new Headers(),
      );
    }

    it("falls back to tool_use when native returns an unsupported 400", async () => {
      const { client, createFn, betaParseFn } = createMockClient();
      betaParseFn.mockRejectedValue(await makeNativeUnsupportedError());
      createFn.mockResolvedValue({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "test",
            input: { answer: "42" },
          },
        ],
      });
      const provider = new AnthropicProvider({
        client,
        model: "claude-opus-4-8",
      });

      const result = await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      });

      expect(result).toEqual({ answer: "42" });
      expect(betaParseFn).toHaveBeenCalledOnce();
      const callArgs = createFn.mock.calls[0]?.[0];
      expect(callArgs.tool_choice).toEqual({ type: "tool", name: "test" });
      expect(callArgs.tools[0].name).toBe("test");
      expect(callArgs.tools[0].input_schema.type).toBe("object");
    });

    it("does NOT fall back on an unrelated 400 (e.g. billing)", async () => {
      const { BadRequestError } = await import("@anthropic-ai/sdk");
      const { client, createFn, betaParseFn } = createMockClient();
      betaParseFn.mockRejectedValue(
        new BadRequestError(
          400,
          { error: { message: "Your credit balance is too low" } },
          "Your credit balance is too low",
          new Headers(),
        ),
      );
      const provider = new AnthropicProvider({
        client,
        model: "claude-opus-4-8",
      });

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "bad_request" }));
      // 폴백을 타지 않는다 — tool_use(messages.create)는 호출되지 않는다.
      expect(createFn).not.toHaveBeenCalled();
    });

    it("throws when the fallback tool_use returns no tool_use block", async () => {
      const { client, createFn, betaParseFn } = createMockClient();
      betaParseFn.mockRejectedValue(await makeNativeUnsupportedError());
      createFn.mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "no tool" }],
      });
      const provider = new AnthropicProvider({
        client,
        model: "claude-opus-4-8",
      });

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM returned no tool_use block",
        }),
      );
    });
  });

  describe("error mapping", () => {
    it("maps APIConnectionTimeoutError to LlmError timeout", async () => {
      const { APIConnectionTimeoutError } = await import("@anthropic-ai/sdk");
      const { provider } = mockCreateRejection(new APIConnectionTimeoutError());

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "timeout" }));
    });

    it("maps RateLimitError to LlmError rate_limit", async () => {
      const { RateLimitError } = await import("@anthropic-ai/sdk");
      const error = new RateLimitError(
        429,
        { error: { message: "rate limited" } },
        "rate limited",
        new Headers(),
      );
      const { provider } = mockCreateRejection(error);

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "rate_limit" }));
    });

    it("maps AuthenticationError to LlmError auth", async () => {
      const { AuthenticationError } = await import("@anthropic-ai/sdk");
      const error = new AuthenticationError(
        401,
        { error: { message: "invalid key" } },
        "invalid key",
        new Headers(),
      );
      const { provider } = mockCreateRejection(error);

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "auth" }));
    });

    it("maps PermissionDeniedError to LlmError auth", async () => {
      const { PermissionDeniedError } = await import("@anthropic-ai/sdk");
      const error = new PermissionDeniedError(
        403,
        { error: { message: "forbidden" } },
        "forbidden",
        new Headers(),
      );
      const { provider } = mockCreateRejection(error);

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "auth" }));
    });

    it("maps BadRequestError to LlmError bad_request", async () => {
      const { BadRequestError } = await import("@anthropic-ai/sdk");
      const error = new BadRequestError(
        400,
        { error: { message: "invalid model" } },
        "invalid model",
        new Headers(),
      );
      const { provider } = mockCreateRejection(error);

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "bad_request" }));
    });

    it("maps unknown errors to LlmError unknown", async () => {
      const { provider } = mockCreateRejection(new Error("something broke"));

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "something broke",
        }),
      );
    });
  });
});
