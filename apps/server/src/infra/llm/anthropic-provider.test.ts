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
  const client = {
    messages: { create: createFn },
  } as unknown as Anthropic;
  return { client, createFn };
}

function mockCreate(response: unknown) {
  const { client, createFn } = createMockClient();
  createFn.mockResolvedValue(response);
  const provider = new AnthropicProvider({ client, model: "claude-opus-4-8" });
  return { provider, createFn };
}

function mockCreateRejection(error: Error) {
  const { client, createFn } = createMockClient();
  createFn.mockRejectedValue(error);
  const provider = new AnthropicProvider({ client, model: "claude-opus-4-8" });
  return { provider, createFn };
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

    it("accepts computeLevel but ignores it (no throw, no SDK param)", async () => {
      // Claude는 computeLevel을 의도적으로 무시한다. 받되 SDK 호출에 새 파라미터가
      // 새지 않고, 동작도 평소와 같음을 핀으로 박는다(후속 매핑 전까지 no-op 보장).
      const { provider, createFn } = mockCreate({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "ok" }],
      });

      const result = await provider.generateText({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        computeLevel: "high",
      });

      expect(result).toBe("ok");
      const callArgs = createFn.mock.calls[0]?.[0];
      expect(callArgs.computeLevel).toBeUndefined();
      expect(callArgs.reasoning_effort).toBeUndefined();
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
      // 잘리기 전 델타는 흘려보냈는지도 확인한다.
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

  describe("generateStructured", () => {
    it("returns parsed tool_use input on success", async () => {
      const { provider, createFn } = mockCreate({
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

      const result = await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "You are a helper.",
        messages: [{ role: "user", content: "What is the answer?" }],
      });

      expect(result).toEqual({ answer: "42" });

      const callArgs = createFn.mock.calls[0]?.[0];
      expect(callArgs.tool_choice).toEqual({ type: "tool", name: "test" });
      expect(callArgs.tools[0].name).toBe("test");
      expect(callArgs.tools[0].input_schema.type).toBe("object");
    });

    it("throws when no tool_use block is present", async () => {
      const { provider } = mockCreate({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "no tool" }],
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

    it("throws when truncated by max_tokens", async () => {
      const { provider } = mockCreate({
        stop_reason: "max_tokens",
        content: [],
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
          message: "LLM response was truncated (stop_reason: max_tokens)",
        }),
      );
    });

    it("throws when model refuses the request", async () => {
      const { provider } = mockCreate({
        stop_reason: "refusal",
        content: [],
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

    it("throws when tool_use input fails schema validation", async () => {
      const { provider } = mockCreate({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "test",
            input: { answer: 123 },
          },
        ],
      });

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
