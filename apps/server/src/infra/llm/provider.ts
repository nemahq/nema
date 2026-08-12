import { getEnv } from "@server/env";
import { LlmError } from "@server/infra/llm/llm-error";
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

// prod 전용 잠금(legacy providers.ts의 setTaskModel과 같은 자리) — 프로덕션에서
// 모델이 조용히 갈아끼워지면 비용·품질 사고로 이어지므로, override 시도 자체를
// 거부한다. overrideSeeded로 한 번 걸러지는 아래 seed 로직과 달리 이 검사는 매
// 호출마다 돈다 — 한 번만 거부하고 그 다음부턴 잠금이 우회되는 걸 막기 위해서다.
function assertOverrideAllowed(env: ReturnType<typeof getEnv>): void {
  if (
    env.DIGEST_GENERATION_LLM_PROVIDER === "vertex" &&
    env.APP_ENV === "production"
  ) {
    throw new LlmError(
      "bad_request",
      "DIGEST_GENERATION_LLM_PROVIDER override is not available in production",
    );
  }
}

function seedDigestGenerationOverride(): void {
  const env = getEnv();
  assertOverrideAllowed(env);
  if (overrideSeeded) {
    return;
  }
  overrideSeeded = true;
  if (env.DIGEST_GENERATION_LLM_PROVIDER === "vertex") {
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
