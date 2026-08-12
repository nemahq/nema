import { GeminiProvider } from "@server/infra/llm/gemini-provider";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { DIGEST_GENERATION_MODEL } from "@server/infra/llm/models";
import { getGeminiClient } from "@server/infra/llm/vertex-client";

let cached: LlmProvider | undefined;

export function getDigestGenerationProvider(): LlmProvider {
  if (!cached) {
    cached = new GeminiProvider(getGeminiClient(), DIGEST_GENERATION_MODEL);
  }
  return cached;
}
