import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { GoogleGenAI } from "@google/genai";

import { GeminiProvider } from "./gemini-provider";
import { LlmError } from "./llm-error";

// 기본 export(클라이언트 생성자)만 막아 실제 네트워크 호출을 차단한다.
vi.mock("@google/genai", async () => {
  const actual =
    await vi.importActual<typeof import("@google/genai")>("@google/genai");
  return { ...actual, GoogleGenAI: vi.fn() };
});

const TestSchema = z.object({ answer: z.string() });

function createMockClient() {
  const generateContent = vi.fn();
  const generateContentStream = vi.fn();
  const client = {
    models: { generateContent, generateContentStream },
  } as unknown as GoogleGenAI;
  return { client, generateContent, generateContentStream };
}

function mockGenerate(response: unknown) {
  const { client, generateContent } = createMockClient();
  generateContent.mockResolvedValue(response);
  const provider = new GeminiProvider({ client, model: "gemini-2.5-pro" });
  return { provider, generateContent };
}

function mockGenerateRejection(error: unknown) {
  const { client, generateContent } = createMockClient();
  generateContent.mockRejectedValue(error);
  const provider = new GeminiProvider({ client, model: "gemini-2.5-pro" });
  return { provider, generateContent };
}

// @google/genai 에러는 ApiError(.status)만 export되므로, 매핑은 status 구조로 검증한다.
function apiError(status: number, message: string): Error {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

describe("GeminiProvider", () => {
  describe("constructor", () => {
    it("throws LlmError when apiKey is empty", () => {
      expect(
        () => new GeminiProvider({ apiKey: "", model: "gemini-2.5-pro" }),
      ).toThrow(LlmError);
    });
  });

  describe("generateText", () => {
    it("returns text on success", async () => {
      const { provider } = mockGenerate({
        text: "Hello world",
        candidates: [{ finishReason: "STOP" }],
      });

      const result = await provider.generateText({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(result).toBe("Hello world");
    });

    it("passes correct parameters to the Gemini SDK", async () => {
      const { provider, generateContent } = mockGenerate({
        text: "ok",
        candidates: [{ finishReason: "STOP" }],
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

      const callArgs = generateContent.mock.calls[0]?.[0];
      expect(callArgs.model).toBe("gemini-2.5-pro");
      expect(callArgs.config.systemInstruction).toBe("System prompt.");
      expect(callArgs.config.temperature).toBe(0.5);
      expect(callArgs.config.maxOutputTokens).toBe(16_384);
      // assistant → "model" 역할 매핑
      expect(callArgs.contents).toEqual([
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi" }] },
        { role: "user", parts: [{ text: "Question" }] },
      ]);
    });

    it("throws when response is truncated by MAX_TOKENS", async () => {
      const { provider } = mockGenerate({
        text: "partial",
        candidates: [{ finishReason: "MAX_TOKENS" }],
      });

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "unknown",
          message: "LLM response was truncated (finishReason: MAX_TOKENS)",
        }),
      );
    });

    it("throws content_filter when blocked by SAFETY", async () => {
      const { provider } = mockGenerate({
        text: "",
        candidates: [{ finishReason: "SAFETY" }],
      });

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "content_filter" }));
    });

    it("throws when there is no text content", async () => {
      const { provider } = mockGenerate({
        text: undefined,
        candidates: [{ finishReason: "STOP" }],
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
    it("yields text from chunks", async () => {
      const chunks = [{ text: "Hel" }, { text: "lo" }, { text: undefined }];
      const { client, generateContentStream } = createMockClient();
      generateContentStream.mockResolvedValue(
        (async function* () {
          yield* chunks;
        })(),
      );
      const provider = new GeminiProvider({ client, model: "gemini-2.5-pro" });

      const collected: string[] = [];
      for await (const chunk of provider.generateStream({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      })) {
        collected.push(chunk);
      }

      expect(collected).toEqual(["Hel", "lo"]);
    });

    it("stops yielding when signal is aborted", async () => {
      const controller = new AbortController();
      const { client, generateContentStream } = createMockClient();
      generateContentStream.mockResolvedValue(
        (async function* () {
          controller.abort();
          yield { text: "should-not-yield" };
        })(),
      );
      const provider = new GeminiProvider({ client, model: "gemini-2.5-pro" });

      const collected: string[] = [];
      for await (const chunk of provider.generateStream({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        signal: controller.signal,
      })) {
        collected.push(chunk);
      }

      expect(collected).toEqual([]);
    });

    it("swallows errors when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const { client, generateContentStream } = createMockClient();
      generateContentStream.mockRejectedValue(new Error("aborted"));
      const provider = new GeminiProvider({ client, model: "gemini-2.5-pro" });

      const collected: string[] = [];
      for await (const chunk of provider.generateStream({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        signal: controller.signal,
      })) {
        collected.push(chunk);
      }

      expect(collected).toEqual([]);
    });
  });

  describe("generateStructured", () => {
    it("returns parsed JSON on success", async () => {
      const { provider, generateContent } = mockGenerate({
        text: JSON.stringify({ answer: "42" }),
        candidates: [{ finishReason: "STOP" }],
      });

      const result = await provider.generateStructured({
        schema: TestSchema,
        schemaName: "test",
        systemPrompt: "You are a helper.",
        messages: [{ role: "user", content: "What is the answer?" }],
      });

      expect(result).toEqual({ answer: "42" });

      const callArgs = generateContent.mock.calls[0]?.[0];
      expect(callArgs.config.responseMimeType).toBe("application/json");
      expect(callArgs.config.responseJsonSchema).toBeDefined();
    });

    it("throws when truncated by MAX_TOKENS", async () => {
      const { provider } = mockGenerate({
        text: "",
        candidates: [{ finishReason: "MAX_TOKENS" }],
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
          message: "LLM response was truncated (finishReason: MAX_TOKENS)",
        }),
      );
    });

    it("throws content_filter when blocked by SAFETY", async () => {
      const { provider } = mockGenerate({
        text: "",
        candidates: [{ finishReason: "SAFETY" }],
      });

      await expect(
        provider.generateStructured({
          schema: TestSchema,
          schemaName: "test",
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "content_filter" }));
    });

    it("throws when response is not valid JSON", async () => {
      const { provider } = mockGenerate({
        text: "not json",
        candidates: [{ finishReason: "STOP" }],
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
          message: "LLM returned non-JSON content",
        }),
      );
    });

    it("throws when parsed JSON fails schema validation", async () => {
      const { provider } = mockGenerate({
        text: JSON.stringify({ answer: 123 }),
        candidates: [{ finishReason: "STOP" }],
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
    it("maps client-side timeout to LlmError timeout", async () => {
      const { provider } = mockGenerateRejection(
        new Error("Request timed out."),
      );

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "timeout" }));
    });

    it("maps status 429 to LlmError rate_limit", async () => {
      const { provider } = mockGenerateRejection(apiError(429, "rate limited"));

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "rate_limit" }));
    });

    it("maps status 401 to LlmError auth", async () => {
      const { provider } = mockGenerateRejection(apiError(401, "invalid key"));

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "auth" }));
    });

    it("maps status 403 to LlmError auth", async () => {
      const { provider } = mockGenerateRejection(apiError(403, "forbidden"));

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "auth" }));
    });

    it("maps status 400 to LlmError bad_request", async () => {
      const { provider } = mockGenerateRejection(
        apiError(400, "invalid model"),
      );

      await expect(
        provider.generateText({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "q" }],
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "bad_request" }));
    });

    it("maps unknown errors to LlmError unknown", async () => {
      const { provider } = mockGenerateRejection(new Error("something broke"));

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
