import { GeminiProvider } from "@server/infra/llm/gemini-provider";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  DIGEST_GENERATION_MODEL,
  STATEMENT_GENERATION_MODEL,
} from "@server/infra/llm/models";
import { getGeminiClient } from "@server/infra/llm/vertex-client";

let cachedDigestProvider: LlmProvider | undefined;
let cachedStatementProvider: LlmProvider | undefined;

export function getDigestGenerationProvider(): LlmProvider {
  if (!cachedDigestProvider) {
    cachedDigestProvider = new GeminiProvider(
      getGeminiClient(),
      DIGEST_GENERATION_MODEL,
    );
  }
  return cachedDigestProvider;
}

export function getStatementGenerationProvider(): LlmProvider {
  if (!cachedStatementProvider) {
    cachedStatementProvider = new GeminiProvider(
      getGeminiClient(),
      STATEMENT_GENERATION_MODEL,
    );
  }
  return cachedStatementProvider;
}
