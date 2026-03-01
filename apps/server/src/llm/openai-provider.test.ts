import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { OpenAiProvider } from "./openai-provider.js";
import { LlmError } from "./errors.js";

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

    it("creates provider with valid apiKey", () => {
      expect(() => createProvider()).not.toThrow();
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs = (provider as any).client.chat.completions.parse.mock
        .calls[0]?.[0];
      expect(callArgs.model).toBe("gpt-4o-mini");
    });

    it("throws LlmError with code 'unknown' when response has no parsed content", async () => {
      mockParse(provider, {
        choices: [{ message: { parsed: null } }],
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

    it("maps APIConnectionTimeoutError to LlmError timeout", async () => {
      // Dynamically import to get the actual error class
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
