import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import type { GoogleGenAI } from "@google/genai";

import { GeminiProvider } from "@server/infra/llm/gemini-provider";
import { LlmError } from "@server/infra/llm/llm-error";
import { createProviderForModel } from "@server/infra/llm/model-factory";
import {
  DIGEST_GENERATION_MODEL_GEMINI,
  DIGEST_GENERATION_MODEL_OPENAI,
} from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";

function fakeClients() {
  return {
    getOpenAiClient: () => ({}) as OpenAI,
    getGeminiClient: () => ({}) as GoogleGenAI,
  };
}

describe("createProviderForModel", () => {
  it("routes an OpenAI catalog id to OpenAiProvider", () => {
    const provider = createProviderForModel({
      modelId: DIGEST_GENERATION_MODEL_OPENAI,
      schemaName: "digest_generation",
      clients: fakeClients(),
    });
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });

  it("routes a Google catalog id to GeminiProvider", () => {
    const provider = createProviderForModel({
      modelId: DIGEST_GENERATION_MODEL_GEMINI,
      schemaName: "digest_generation",
      clients: fakeClients(),
    });
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it("throws LlmError for a model id absent from the catalog", () => {
    expect(() =>
      createProviderForModel({
        modelId: "not-a-real-model",
        schemaName: "digest_generation",
        clients: fakeClients(),
      }),
    ).toThrow(LlmError);
  });
});
