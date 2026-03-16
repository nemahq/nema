import { getEnv } from "@server/env";

// 동작별 모델 매핑은 docs/llm-model-map.md 참고
export function getLlmModels() {
  const env = getEnv();

  return {
    standard: env.LLM_MODEL_STANDARD ?? "gpt-5",
    mini: env.LLM_MODEL_MINI ?? "gpt-5-mini",
    nano: env.LLM_MODEL_NANO ?? "gpt-5-nano",
  } as const;
}
