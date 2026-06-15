// 모델 레지스트리 — task 라우팅(NEM-146)이 override 모델 id를 검증·해석하는 단일 출처.
// 단가·세부 능력은 Phase 2(NEM-149)로 미룬다. provider 어댑터는 NEM-147/148.
import {
  DEFAULT_MINI_MODEL,
  DEFAULT_NANO_MODEL,
  DEFAULT_STANDARD_MODEL,
} from "@server/infra/llm/models";

export type LlmProviderId = "openai" | "anthropic" | "google";

export interface ModelSpec {
  id: string;
  provider: LlmProviderId;
  contextWindow?: number;
}

// gpt-5 계열 컨텍스트 윈도우 — 입력+출력 합산 상한(토큰).
const GPT5_CONTEXT_WINDOW = 400_000;

// 알려진 모델 집합. env로 모델 id가 덮였다면(LLM_MODEL_*) 그 id는 여기 없을 수 있고,
// getModelSpec은 undefined를 돌려준다 — 라우팅 기본 경로(TASK_DEFAULT_TIER→tier)는
// 카탈로그를 거치지 않으므로 env override가 있어도 기본 동작은 깨지지 않는다.
// 카탈로그는 "런타임에 명시적으로 갈아끼울 수 있는" 모델의 화이트리스트다.
export const MODEL_CATALOG: Record<string, ModelSpec> = {
  [DEFAULT_STANDARD_MODEL]: {
    id: DEFAULT_STANDARD_MODEL,
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
  },
  [DEFAULT_MINI_MODEL]: {
    id: DEFAULT_MINI_MODEL,
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
  },
  [DEFAULT_NANO_MODEL]: {
    id: DEFAULT_NANO_MODEL,
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
  },
};

export function getModelSpec(id: string): ModelSpec | undefined {
  return MODEL_CATALOG[id];
}
