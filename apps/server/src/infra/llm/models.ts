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

// task 라우팅이 override 모델용 provider를 만들 때 같은 OpenAI 클라이언트를
// 재사용하도록 공유 client를 함께 돌려준다 — task별 모델마다 클라이언트를 새로 열지 않는다.
export interface TieredLlmBundle {
  readonly tiers: TieredLlm;
  readonly openAiClient: OpenAI;
}

// 동작별 모델 매핑은 docs/guides/llm-model-map.md 참고
export function createTieredLlm(args: {
  apiKey: string;
  modelStandard?: string;
  modelMini?: string;
  modelNano?: string;
}): TieredLlmBundle {
  const client = new OpenAI({
    apiKey: args.apiKey,
    timeout: DEFAULT_TIMEOUT_MS,
  });

  const tiers: TieredLlm = {
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

  return { tiers, openAiClient: client };
}
