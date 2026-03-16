import OpenAI from "openai";

import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  DEFAULT_TIMEOUT_MS,
  OpenAiProvider,
} from "@server/infra/llm/openai-provider";

export const DEFAULT_STANDARD_MODEL = "gpt-5";
export const DEFAULT_MINI_MODEL = "gpt-5-mini";
export const DEFAULT_NANO_MODEL = "gpt-5-nano";

export interface TieredLlm {
  readonly standard: LlmProvider;
  readonly mini: LlmProvider;
  readonly nano: LlmProvider;
}

// 동작별 모델 매핑은 docs/llm-model-map.md 참고
export function createTieredLlm(args: {
  apiKey: string;
  modelStandard?: string;
  modelMini?: string;
  modelNano?: string;
}): TieredLlm {
  const client = new OpenAI({
    apiKey: args.apiKey,
    timeout: DEFAULT_TIMEOUT_MS,
  });

  return {
    standard: new OpenAiProvider({
      client,
      model: args.modelStandard ?? DEFAULT_STANDARD_MODEL,
    }),
    mini: new OpenAiProvider({
      client,
      model: args.modelMini ?? DEFAULT_MINI_MODEL,
    }),
    nano: new OpenAiProvider({
      client,
      model: args.modelNano ?? DEFAULT_NANO_MODEL,
    }),
  };
}
