import { getEnv } from "@server/env";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { createProviderForModel } from "@server/infra/llm/model-factory";
import { DIGEST_GENERATION_MODEL_GEMINI } from "@server/infra/llm/models";
import { getOpenAiClient } from "@server/infra/llm/openai-client";
import {
  type LlmTask,
  resolveModelId,
  setTaskOverride,
  TASK_DEFAULTS,
} from "@server/infra/llm/task-routing";
import { getGeminiClient } from "@server/infra/llm/vertex-client";

const cache = new Map<LlmTask, LlmProvider>();

// DIGEST_GENERATION_LLM_PROVIDER=vertex를 task-routing의 런타임 override로 옮겨
// 심는다 — 최초 호출 한 번만, 캐시가 채워지기 전에.
let overrideSeeded = false;

function seedDigestGenerationOverride(): void {
  if (overrideSeeded) {
    return;
  }
  overrideSeeded = true;
  if (getEnv().DIGEST_GENERATION_LLM_PROVIDER === "vertex") {
    setTaskOverride("generateDigests", DIGEST_GENERATION_MODEL_GEMINI);
  }
}

export function getDigestGenerationProvider(): LlmProvider {
  return getProviderForTask("generateDigests");
}

function getProviderForTask(task: LlmTask): LlmProvider {
  seedDigestGenerationOverride();
  let provider = cache.get(task);
  if (!provider) {
    provider = createProviderForModel({
      modelId: resolveModelId(task),
      schemaName: TASK_DEFAULTS[task].schemaName,
      clients: { getOpenAiClient, getGeminiClient },
    });
    cache.set(task, provider);
  }
  return provider;
}
