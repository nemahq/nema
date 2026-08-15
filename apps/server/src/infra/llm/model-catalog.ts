// 모델 레지스트리 — task-routing이 override 모델 id를 검증하는 단일 출처
// (legacy/apps/server/src/infra/llm/model-catalog.ts의 축소판).
// task들이 실제로 쓰는 모델만 등록한다.
// 단가(legacy의 ModelPricing)는 지금 값을 모르니 넣지 않는다 — 확정되면 그때 필드를 추가한다.
import {
  DIGEST_GENERATION_MODEL_GEMINI,
  DIGEST_GENERATION_MODEL_OPENAI,
} from "@server/infra/llm/models";

// 밖에서는 getModelSpec()의 반환값으로만 구조적으로 쓰인다 — 타입/카탈로그 자체를
// import하는 곳이 없어 export하지 않는다.
type LlmProviderId = "openai" | "google";

interface ModelSpec {
  id: string;
  provider: LlmProviderId;
}

// 카탈로그 항목에서 id를 뺀 형태 — id는 키에서 파생하므로 키/id 불일치가 구조적으로 불가능하다.
type ModelEntry = Omit<ModelSpec, "id">;

const MODEL_CATALOG: Record<string, ModelEntry> = {
  [DIGEST_GENERATION_MODEL_OPENAI]: { provider: "openai" },
  [DIGEST_GENERATION_MODEL_GEMINI]: { provider: "google" },
};

export function getModelSpec(id: string): ModelSpec | undefined {
  const entry = MODEL_CATALOG[id];
  if (!entry) {
    return undefined;
  }
  return { id, ...entry };
}
