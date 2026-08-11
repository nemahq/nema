import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { GoogleGenAI } from "@google/genai";

import {
  GeminiProvider,
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
} from "@server/infra/llm/gemini-provider";
import { LlmError } from "@server/infra/llm/llm-error";

const TestSchema = z.object({ answer: z.string() });

function createProvider() {
  const generateContent = vi.fn();
  const client = {
    models: { generateContent },
  } as unknown as GoogleGenAI;
  const provider = new GeminiProvider(client, "gemini-3.1-flash-lite");
  return { provider, generateContent };
}

function callGenerateStructured(provider: GeminiProvider) {
  return provider.generateStructured({
    systemPrompt: "sys",
    messages: [{ role: "user", content: "hi" }],
    schema: TestSchema,
  });
}

// 매핑은 instanceof가 아니라 구조적 .status로 동작하므로(어댑터 주석 참고), ApiError
// 인스턴스 대신 .status를 단 일반 Error로 그 경로를 검증한다.
function apiError(status: number, message: string): Error {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

describe("GeminiProvider.generateStructured", () => {
  it("parses and returns the JSON response on success", async () => {
    const { provider, generateContent } = createProvider();
    generateContent.mockResolvedValue({
      text: JSON.stringify({ answer: "ok" }),
      candidates: [{ finishReason: "STOP" }],
    });

    const result = await callGenerateStructured(provider);

    expect(result).toEqual({ answer: "ok" });
  });

  it("throws when the response doesn't match the schema", async () => {
    const { provider, generateContent } = createProvider();
    generateContent.mockResolvedValue({
      text: JSON.stringify({ wrong: "shape" }),
      candidates: [{ finishReason: "STOP" }],
    });

    await expect(callGenerateStructured(provider)).rejects.toThrow(LlmError);
  });

  it("maps a SAFETY finishReason to content_filter", async () => {
    const { provider, generateContent } = createProvider();
    generateContent.mockResolvedValue({
      text: null,
      candidates: [{ finishReason: "SAFETY" }],
    });

    await expect(callGenerateStructured(provider)).rejects.toMatchObject({
      code: "content_filter",
    });
  });

  it("maps a blocked prompt to content_filter", async () => {
    const { provider, generateContent } = createProvider();
    generateContent.mockResolvedValue({
      promptFeedback: { blockReason: "OTHER" },
    });

    await expect(callGenerateStructured(provider)).rejects.toMatchObject({
      code: "content_filter",
    });
  });

  it("maps HTTP 429 to rate_limit", async () => {
    const { provider, generateContent } = createProvider();
    generateContent.mockRejectedValue(
      apiError(HTTP_TOO_MANY_REQUESTS, "Too many requests"),
    );

    await expect(callGenerateStructured(provider)).rejects.toMatchObject({
      code: "rate_limit",
    });
  });

  it("maps HTTP 401 to auth", async () => {
    const { provider, generateContent } = createProvider();
    generateContent.mockRejectedValue(
      apiError(HTTP_UNAUTHORIZED, "Unauthorized"),
    );

    await expect(callGenerateStructured(provider)).rejects.toMatchObject({
      code: "auth",
    });
  });

  it("maps HTTP 403 to auth", async () => {
    const { provider, generateContent } = createProvider();
    generateContent.mockRejectedValue(apiError(HTTP_FORBIDDEN, "Forbidden"));

    await expect(callGenerateStructured(provider)).rejects.toMatchObject({
      code: "auth",
    });
  });

  it("maps HTTP 400 to bad_request", async () => {
    const { provider, generateContent } = createProvider();
    generateContent.mockRejectedValue(
      apiError(HTTP_BAD_REQUEST, "Bad request"),
    );

    await expect(callGenerateStructured(provider)).rejects.toMatchObject({
      code: "bad_request",
    });
  });
});
