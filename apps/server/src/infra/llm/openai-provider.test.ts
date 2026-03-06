import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { OpenAiProvider } from "./openai-provider.js";
import { LlmError } from "./llm-error.js";

// Mock OpenAI SDK
vi.mock("openai", () => {
  const MockOpenAI = vi.fn();
  return { default: MockOpenAI };
});

vi.mock("openai/helpers/zod", () => ({
  zodResponseFormat: vi.fn((_schema: unknown, name: string) => ({
    type: "json_schema",
    json_schema: { name },
  })),
}));

const TestSchema = z.object({ answer: z.string() });

function createProvider(overrides?: { model?: string; timeout?: number }) {
  return new OpenAiProvider({ apiKey: "test-key", ...overrides });
}

function mockParse(provider: OpenAiProvider, response: unknown) {
  const parseFn = vi.fn().mockResolvedValue(response);
  // Access the private client to attach mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (provider as any).client = {
    chat: { completions: { parse: parseFn } },
  };
  return parseFn;
}

function mockParseRejection(provider: OpenAiProvider, error: Error) {
  const parseFn = vi.fn().mockRejectedValue(error);
  // Access the private client to attach mock rejection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (provider as any).client = {
    chat: { completions: { parse: parseFn } },
  };
  return parseFn;
}

describe("OpenAiProvider", () => {
  describe("constructor", () => {
    it("throws LlmError when apiKey is empty", () => {
      expect(() => new OpenAiProvider({ apiKey: "" })).toThrow(LlmError);
    });
  });

  describe("generateStructured", () => {
    let provider: OpenAiProvider;

    beforeEach(() => {
      provider = createProvider();
    });

    it("returns parsed response on success", async () => {
      const parseFn = mockParse(provider, {
        choices: [{ message: { parsed: { answer: "42" } } }],
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

    it("passes correct parameters to OpenAI SDK", async () => {
      const parseFn = mockParse(provider, {
        choices: [{ message: { parsed: { answer: "ok" } } }],
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
      expect(callArgs.model).toBe("gpt-4o");
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.messages).toEqual([
        { role: "system", content: "System prompt." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Question" },
      ]);
      expect(callArgs.response_format).toEqual({
        type: "json_schema",
        json_schema: { name: "test_schema" },
      });
    });

    it("uses custom model when provided in params", async () => {
      mockParse(provider, {
        choices: [{ message: { parsed: { answer: "ok" } } }],
      });

      await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        model: "gpt-4o-mini",
      });

      // Access mock via private client to verify call args
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs = (provider as any).client.chat.completions.parse.mock
        .calls[0]?.[0];
      expect(callArgs.model).toBe("gpt-4o-mini");
    });

    it("throws when choices array is empty", async () => {
      mockParse(provider, { choices: [] });

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
          message: "LLM returned no choices",
        }),
      );
    });

    it("throws when response is truncated", async () => {
      mockParse(provider, {
        choices: [
          { finish_reason: "length", message: { parsed: { answer: "ok" } } },
        ],
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
          message: "LLM response was truncated (finish_reason: length)",
        }),
      );
    });

    it("throws when response is blocked by content filter", async () => {
      mockParse(provider, {
        choices: [
          {
            finish_reason: "content_filter",
            message: { parsed: null },
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
      ).rejects.toThrow(
        expect.objectContaining({
          code: "content_filter",
          message: "LLM response was blocked by content filter",
        }),
      );
    });

    it("throws when model refuses the request", async () => {
      mockParse(provider, {
        choices: [
          {
            finish_reason: "stop",
            message: { parsed: null, refusal: "I cannot help with that" },
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
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM refused the request: I cannot help with that",
        }),
      );
    });

    it("throws when response has no parsed content", async () => {
      mockParse(provider, {
        choices: [{ finish_reason: "stop", message: { parsed: null } }],
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
      mockParse(provider, {
        choices: [
          { finish_reason: "stop", message: { parsed: { answer: 123 } } },
        ],
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
      mockParseRejection(provider, new APIConnectionTimeoutError());

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

      mockParseRejection(
        provider,
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

      mockParseRejection(
        provider,
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

      mockParseRejection(
        provider,
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

      mockParseRejection(
        provider,
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
      mockParseRejection(provider, new Error("something broke"));

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
