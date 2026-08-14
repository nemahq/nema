// task별 모델 라우팅 (legacy/apps/server/src/infra/llm/task-routing.ts의 축소판) —
// legacy와 같은 모양(task → 기본 모델, 카탈로그로 검증되는 런타임 override)이지만
// 내용은 지금 실제로 쓰는 task만 채운다. tier·effort는 그걸 쓰는 task/프로바이더
// 경로가 아직 없어 같이 안 가져왔다 — 필요해지면 legacy를 다시 참고해 채운다.
import { LlmError } from "@server/infra/llm/llm-error";
import { getModelSpec } from "@server/infra/llm/model-catalog";
import {
  DIGEST_DEDUP_SCHEMA_NAME,
  DIGEST_GENERATION_MODEL_OPENAI,
  DIGEST_GENERATION_SCHEMA_NAME,
  RELATION_JUDGMENT_SCHEMA_NAME,
} from "@server/infra/llm/models";

export type LlmTask =
  | "generateDigests"
  | "judgeRelations"
  | "dropDuplicateDigests";

interface TaskDefault {
  modelId: string;
  schemaName: string;
}

export const TASK_DEFAULTS = {
  generateDigests: {
    modelId: DIGEST_GENERATION_MODEL_OPENAI,
    schemaName: DIGEST_GENERATION_SCHEMA_NAME,
  },
  judgeRelations: {
    modelId: DIGEST_GENERATION_MODEL_OPENAI,
    schemaName: RELATION_JUDGMENT_SCHEMA_NAME,
  },
  dropDuplicateDigests: {
    modelId: DIGEST_GENERATION_MODEL_OPENAI,
    schemaName: DIGEST_DEDUP_SCHEMA_NAME,
  },
} as const satisfies Record<LlmTask, TaskDefault>;

// 런타임 override — 메모리 전용이라 재시작하면 전부 기본값으로 돌아온다.
const taskOverrides = new Map<LlmTask, string>();

export function setTaskOverride(task: LlmTask, modelId: string): void {
  if (!getModelSpec(modelId)) {
    throw new LlmError(
      "bad_request",
      `Unknown model id "${modelId}" — not registered in MODEL_CATALOG`,
    );
  }
  taskOverrides.set(task, modelId);
}

export function clearTaskOverride(task: LlmTask): void {
  taskOverrides.delete(task);
}

export function resolveModelId(task: LlmTask): string {
  return taskOverrides.get(task) ?? TASK_DEFAULTS[task].modelId;
}
