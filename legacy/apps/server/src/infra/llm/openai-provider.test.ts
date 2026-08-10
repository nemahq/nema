import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { LlmError } from "./llm-error";
import { OpenAiProvider } from "./openai-provider";

vi.mock("openai", () => {
  const MockOpenAI = vi.fn();
  return { default: MockOpenAI };
});

vi.mock("openai/helpers/zod", () => ({
  zodTextFormat: vi.fn((_schema: unknown, name: string) => ({
    type: "json_schema",
    name,
  })),
}));

const TestSchema = z.object({ answer: z.string() });

function createMockClient() {
  const parseFn = vi.fn();
  const createFn = vi.fn();
  const client = {
    responses: { parse: parseFn, create: createFn },
  } as unknown as OpenAI;
  return { client, parseFn, createFn };
}

function mockParse(response: unknown) {
  const { client, parseFn } = createMockClient();
  parseFn.mockResolvedValue(response);
  const provider = new OpenAiProvider({ client, model: "gpt-5" });
  return { provider, parseFn };
}

function mockParseRejection(error: Error) {
  const { client, parseFn } = createMockClient();
  parseFn.mockRejectedValue(error);
  const provider = new OpenAiProvider({ client, model: "gpt-5" });
  return { provider, parseFn };
}

function mockCreate(response: unknown) {
  const { client, createFn } = createMockClient();
  createFn.mockResolvedValue(response);
  const provider = new OpenAiProvider({ client, model: "gpt-5" });
  return { provider, createFn };
}

// 비동기 이벤트 스트림 + abort 신호를 노출하는 Responses 스트림 더블
function makeStream(events: unknown[]) {
  const abort = vi.fn();
  const stream = {
    controller: { abort },
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
  return { stream, abort };
}

describe("OpenAiProvider", () => {
  describe("constructor", () => {
    it("throws LlmError when apiKey is empty", () => {
      expect(() => new OpenAiProvider({ apiKey: "", model: "gpt-5" })).toThrow(
        LlmError,
      );
    });
  });

  describe("generateText", () => {
    it("returns output_text on success", async () => {
      const { provider } = mockCreate({
        status: "completed",
        output_text: "hello world",
      });

      const result = await provider.generateText({
        systemPrompt: "You are a helper.",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(result).toBe("hello world");
    });

    it("maps systemPrompt to instructions and messages to input", async () => {
      const { provider, createFn } = mockCreate({
        status: "completed",
        output_text: "ok",
      });

      await provider.generateText({
        systemPrompt: "System prompt.",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
          { role: "user", content: "Question" },
        ],
        temperature: 0.5,
        effort: "low",
      });

      const callArgs = createFn.mock.calls[0]?.[0];
      expect(callArgs.model).toBe("gpt-5");
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.instructions).toBe("System prompt.");
      expect(callArgs.reasoning).toEqual({ effort: "low" });
      expect(callArgs.input).toEqual([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Question" },
      ]);
    });

    it("omits reasoning when effort is not set", async () => {
      const { provider, createFn } = mockCreate({
        status: "completed",
        output_text: "ok",
      });

      await provider.generateText({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      });

      expect(createFn.mock.calls[0]?.[0].reasoning).toBeUndefined();
    });

    it("throws truncation error when status is incomplete (max_output_tokens)", async () => {
      const { provider } = mockCreate({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "",
      });

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM response was truncated (incomplete: max_output_tokens)",
        }),
      );
    });

    it("throws content_filter error when status is incomplete (content_filter)", async () => {
      const { provider } = mockCreate({
        status: "incomplete",
        incomplete_details: { reason: "content_filter" },
        output_text: "",
      });

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "content_filter",
          message: "LLM response was blocked by content filter",
        }),
      );
    });

    it("throws when output_text is empty", async () => {
      const { provider } = mockCreate({
        status: "completed",
        output_text: "",
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
  });

  describe("generateStream", () => {
    it("yields text from output_text.delta events", async () => {
      const { stream } = makeStream([
        { type: "response.output_text.delta", delta: "Hel" },
        { type: "response.created" },
        { type: "response.output_text.delta", delta: "lo" },
        { type: "response.completed" },
      ]);
      const createFn = vi.fn().mockResolvedValue(stream);
      const client = {
        responses: { create: createFn },
      } as unknown as OpenAI;
      const provider = new OpenAiProvider({ client, model: "gpt-5" });

      const chunks: string[] = [];
      for await (const chunk of provider.generateStream({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Hel", "lo"]);
      expect(createFn.mock.calls[0]?.[0].stream).toBe(true);
      // store 기본값(true) 보관을 끄고 보냈는지 핀으로 박는다.
      expect(createFn.mock.calls[0]?.[0].store).toBe(false);
    });

    it("throws when the stream ends incomplete (max_output_tokens)", async () => {
      // 종료 이벤트가 status incomplete를 싣고 오면 비스트리밍 경로와 같은
      // truncation LlmError로 끊어야 한다(조용히 끝나면 안 됨).
      const { stream } = makeStream([
        { type: "response.output_text.delta", delta: "partial" },
        {
          type: "response.incomplete",
          response: {
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [],
          },
        },
      ]);
      const createFn = vi.fn().mockResolvedValue(stream);
      const client = {
        responses: { create: createFn },
      } as unknown as OpenAI;
      const provider = new OpenAiProvider({ client, model: "gpt-5" });

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
          message: "LLM response was truncated (incomplete: max_output_tokens)",
        }),
      );
      // 종료 검사 전까지 흘러온 델타는 정상적으로 yield된다.
      expect(chunks).toEqual(["partial"]);
    });

    it("throws when the stream ends in a refusal (response.completed)", async () => {
      const { stream } = makeStream([
        {
          type: "response.completed",
          response: {
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  { type: "refusal", refusal: "I cannot help with that" },
                ],
              },
            ],
          },
        },
      ]);
      const createFn = vi.fn().mockResolvedValue(stream);
      const client = {
        responses: { create: createFn },
      } as unknown as OpenAI;
      const provider = new OpenAiProvider({ client, model: "gpt-5" });

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
          message: "LLM refused the request: I cannot help with that",
        }),
      );
      expect(chunks).toEqual([]);
    });

    it("aborts the stream and stops yielding when signal is aborted", async () => {
      const { stream, abort } = makeStream([
        { type: "response.output_text.delta", delta: "a" },
        { type: "response.output_text.delta", delta: "b" },
      ]);
      const createFn = vi.fn().mockResolvedValue(stream);
      const client = {
        responses: { create: createFn },
      } as unknown as OpenAI;
      const provider = new OpenAiProvider({ client, model: "gpt-5" });

      const controller = new AbortController();
      controller.abort();

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
  });

  describe("generateStructured", () => {
    it("returns parsed response on success", async () => {
      const { provider, parseFn } = mockParse({
        status: "completed",
        output: [],
        output_parsed: { answer: "42" },
      });

      const result = await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "You are a helper.",
        messages: [{ role: "user", content: "What is the answer?" }],
      });

      expect(result).toEqual({ answer: "42" });
      expect(parseFn).toHaveBeenCalledOnce();
    });

    // output_tokens엔 reasoning이 이미 포함 — provider가 조용히 usage를 안 주면 비용=0이 된다.
    it("reports billed token usage via onUsage on success", async () => {
      const { provider } = mockParse({
        status: "completed",
        output: [],
        output_parsed: { answer: "42" },
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          input_tokens_details: { cached_tokens: 100 },
          output_tokens_details: { reasoning_tokens: 50 },
        },
      });
      const reported: unknown[] = [];

      await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        onUsage: (usage) => reported.push(usage),
      });

      expect(reported).toEqual([
        {
          inputTokens: 1000,
          outputTokens: 200,
          cachedInputTokens: 100,
          reasoningTokens: 50,
        },
      ]);
    });

    it("passes correct parameters to OpenAI SDK", async () => {
      const { provider, parseFn } = mockParse({
        status: "completed",
        output: [],
        output_parsed: { answer: "ok" },
      });

      await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test_schema",
        systemPrompt: "System prompt.",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
          { role: "user", content: "Question" },
        ],
        temperature: 0.5,
      });

      const callArgs = parseFn.mock.calls[0]?.[0];
      expect(callArgs.model).toBe("gpt-5");
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.instructions).toBe("System prompt.");
      expect(callArgs.input).toEqual([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Question" },
      ]);
      expect(callArgs.text).toEqual({
        format: { type: "json_schema", name: "test_schema" },
      });
    });

    it("throws when response is truncated (incomplete: max_output_tokens)", async () => {
      const { provider } = mockParse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
        output_parsed: { answer: "ok" },
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
          message: "LLM response was truncated (incomplete: max_output_tokens)",
        }),
      );
    });

    it("throws when response is blocked by content filter", async () => {
      const { provider } = mockParse({
        status: "incomplete",
        incomplete_details: { reason: "content_filter" },
        output: [],
        output_parsed: null,
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
          code: "content_filter",
          message: "LLM response was blocked by content filter",
        }),
      );
    });

    it("throws when model refuses the request", async () => {
      const { provider } = mockParse({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "I cannot help with that" }],
          },
        ],
        output_parsed: null,
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
          message: "LLM refused the request: I cannot help with that",
        }),
      );
    });

    it("throws when response has no parsed content", async () => {
      const { provider } = mockParse({
        status: "completed",
        output: [],
        output_parsed: null,
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
          message: "LLM returned no parseable response",
        }),
      );
    });

    it("throws when parsed response fails schema validation", async () => {
      const { provider } = mockParse({
        status: "completed",
        output: [],
        output_parsed: { answer: 123 },
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
        }),
      );
    });

    it("maps APIConnectionTimeoutError to LlmError timeout", async () => {
      const { APIConnectionTimeoutError } = await import("openai/error");
      const { provider } = mockParseRejection(new APIConnectionTimeoutError());

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "timeout" }));
    });

    it("maps RateLimitError to LlmError rate_limit", async () => {
      const { RateLimitError } = await import("openai/error");
      const error = RateLimitError.generate(
        429,
        { error: { message: "rate limited" } },
        "rate limited",
        new Headers(),
      );

      const { provider } = mockParseRejection(
        error as InstanceType<typeof RateLimitError>,
      );

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "rate_limit" }));
    });

    it("maps AuthenticationError to LlmError auth", async () => {
      const { AuthenticationError } = await import("openai/error");
      const error = AuthenticationError.generate(
        401,
        { error: { message: "invalid key" } },
        "invalid key",
        new Headers(),
      );

      const { provider } = mockParseRejection(
        error as InstanceType<typeof AuthenticationError>,
      );

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "auth" }));
    });

    it("maps PermissionDeniedError to LlmError auth", async () => {
      const { PermissionDeniedError } = await import("openai/error");
      const error = PermissionDeniedError.generate(
        403,
        { error: { message: "forbidden" } },
        "forbidden",
        new Headers(),
      );

      const { provider } = mockParseRejection(
        error as InstanceType<typeof PermissionDeniedError>,
      );

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "auth" }));
    });

    it("maps BadRequestError to LlmError bad_request", async () => {
      const { BadRequestError } = await import("openai/error");
      const error = BadRequestError.generate(
        400,
        { error: { message: "invalid model" } },
        "invalid model",
        new Headers(),
      );

      const { provider } = mockParseRejection(
        error as InstanceType<typeof BadRequestError>,
      );

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "bad_request" }));
    });

    it("maps unknown errors to LlmError unknown", async () => {
      const { provider } = mockParseRejection(new Error("something broke"));

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
          message: "something broke",
        }),
      );
    });
  });
});
