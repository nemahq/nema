import { getEnv } from "@server/env";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";

export interface TieredLlm {
  standard: LlmProvider;
  mini: LlmProvider;
  nano: LlmProvider;
}

// 동작별 모델 매핑은 docs/llm-model-map.md 참고
export function createTieredLlm(apiKey: string): TieredLlm {
  const env = getEnv();

  return {
    standard: new OpenAiProvider({
      apiKey,
      model: env.LLM_MODEL_STANDARD ?? "gpt-5",
    }),
    mini: new OpenAiProvider({
      apiKey,
      model: env.LLM_MODEL_MINI ?? "gpt-5-mini",
    }),
    nano: new OpenAiProvider({
      apiKey,
      model: env.LLM_MODEL_NANO ?? "gpt-5-nano",
    }),
  };
}
