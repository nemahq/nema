import { getEnv } from "@server/env";
import { GeminiProvider } from "@server/infra/llm/gemini-provider";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  DIGEST_GENERATION_MODEL_GEMINI,
  DIGEST_GENERATION_MODEL_OPENAI,
  DIGEST_GENERATION_SCHEMA_NAME,
} from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import { getGeminiClient } from "@server/infra/llm/vertex-client";

let cached: LlmProvider | undefined;

export function getDigestGenerationProvider(): LlmProvider {
  if (!cached) {
    cached = createDigestGenerationProvider();
  }
  return cached;
}

function createDigestGenerationProvider(): LlmProvider {
  const env = getEnv();
  if (env.DIGEST_GENERATION_LLM_PROVIDER === "vertex") {
    return new GeminiProvider(
      getGeminiClient(),
      DIGEST_GENERATION_MODEL_GEMINI,
    );
  }
  return new OpenAiProvider({
    apiKey: env.OPENAI_API_KEY ?? "",
    model: DIGEST_GENERATION_MODEL_OPENAI,
    schemaName: DIGEST_GENERATION_SCHEMA_NAME,
  });
}
