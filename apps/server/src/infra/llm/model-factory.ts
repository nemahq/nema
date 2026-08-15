// modelId(MODEL_CATALOG) → 실제 프로바이더 어댑터. task-routing이 해석한 모델 id만
// 받아 조립한다 — 이 파일은 어느 task인지 모른다(legacy model-factory.ts의 축소판,
// anthropic 경로는 프로바이더 자체를 아직 안 들여서 뺐다).
import { GeminiProvider } from "@server/infra/llm/gemini-provider";
import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { getModelSpec } from "@server/infra/llm/model-catalog";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import type { ProviderClients } from "@server/infra/llm/provider-clients";

export function createProviderForModel(args: {
  modelId: string;
  schemaName: string;
  clients: ProviderClients;
}): LlmProvider {
  const { modelId, schemaName, clients } = args;
  const spec = getModelSpec(modelId);
  if (!spec) {
    throw new LlmError(
      "bad_request",
      `Unknown model id "${modelId}" — not in MODEL_CATALOG`,
    );
  }

  switch (spec.provider) {
    case "openai":
      return new OpenAiProvider({
        client: clients.getOpenAiClient(),
        model: spec.id,
        schemaName,
      });
    case "google":
      return new GeminiProvider(clients.getGeminiClient(), spec.id);
    default: {
      const exhaustive: never = spec.provider;
      throw new LlmError(
        "bad_request",
        `No adapter wired for provider "${String(exhaustive)}" (model "${modelId}")`,
      );
    }
  }
}
