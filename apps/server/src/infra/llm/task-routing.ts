// task별 모델 라우팅 — 5개 LLM 기능마다 독립적으로 모델을 갈아끼우는 층.
// 기본값은 각 task가 현재 쓰는 tier를 그대로 가리켜(아래 TASK_DEFAULTS),
// override가 없으면 동작이 불변이다. override는 메모리 전용(재배포 없이 런타임 스위칭).
import { z } from "zod";

import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmEffort, OpenAiEffort } from "@server/infra/llm/llm-provider";
import {
  getModelSpec,
  isEffortValidFor,
} from "@server/infra/llm/model-catalog";

// task 목록 단일 출처 — dev-router의 런타임 입력 검증도 이 enum을 공유한다.
// 나눠 적으면 새 task를 한쪽만 추가했을 때 런타임 검증이 조용히 어긋난다.
// 값 규칙: <동사><목적어> — LLM이 수행하는 동작 + 도메인 객체. 값만 봐도 무엇을 하는지 읽히게 한다.
export const LLM_TASK_SCHEMA = z.enum([
  "generateDraft",
  "classifyDraftIntent",
  "generateSessionTitle",
  "extractStatements",
  "generateDigests",
  "judgeRelations",
  "narrate",
  "structureQuery",
  "selectScopeTopics",
]);

export type LlmTask = z.infer<typeof LLM_TASK_SCHEMA>;

type Tier = "standard" | "mini" | "nano";

interface TaskDefault {
  tier: Tier;
  // 기본 경로는 OpenAI tier라 effort도 OpenAI 어휘. 미지정이면 effort 없이 호출(동작 불변).
  effort?: OpenAiEffort;
}

// 각 task의 기본 tier·effort — 5개 호출부가 현재 쓰는 설정을 그대로 미러한다.
// 이 표가 곧 "override 없을 때의 동작 불변" 계약이다.
export const TASK_DEFAULTS = {
  generateDraft: { tier: "standard" },
  classifyDraftIntent: { tier: "mini" },
  generateSessionTitle: { tier: "nano" },
  extractStatements: { tier: "standard", effort: "low" },
  // Digest 생성: 원문을 유형별 정리본으로 쪼개고 라벨·레퍼런스까지 제안. 사람이 그대로
  // 확정하는 품질이 목표라 standard, effort는 추출과 같은 이유로 low(타임아웃 변동 억제).
  generateDigests: { tier: "standard", effort: "low" },
  judgeRelations: { tier: "standard", effort: "low" },
  // 해설: 근거 묶음을 산문으로 풀어 읽는다. 품질이 신뢰의 핵심이라 standard.
  narrate: { tier: "standard" },
  // 질의 구조화: 검색어를 의미부 + 시간 토큰으로 가른다. 검색 경로라 싸고 빨라야 해 mini.
  structureQuery: { tier: "mini" },
  // coarse 라우팅: 질의를 공간 주제로 보낸다. 검색 경로라 mini. structureQuery와 병렬 호출.
  selectScopeTopics: { tier: "mini" },
} as const satisfies Record<LlmTask, TaskDefault>;

// task → override. effort는 그 모델 프로바이더의 네이티브 값(set 시점에 검증).
export interface TaskOverride {
  modelId: string;
  effort?: LlmEffort;
}

// NEM-149 가성비 측정 기반 기본 모델 배치(잠정) — 추출은 gpt-5 유지(품질 1등), 나머지는 Gemini가
// 가성비/품질 우위라 박는다. forTask가 override를 먼저 보므로 이 맵이 prod·staging 공통 기본값이 된다.
// 관계 effort는 측정과 동일하게 "low" — 빠뜨리면 thinking 없이 돌아 측정과 달라진다.
// 되돌리기: staging/dev는 dev-router(clearTaskOverride)로 즉시. prod는 런타임 override 변경이
//   막혀 있어(dev-router·setTaskModel이 prod에서 throw) 이 맵을 고쳐 재배포해야 한다.
// Gemini 키 부재 시: forTask가 이 override를 무시하고 gpt-5 tier로 폴백한다(providers.ts 가드).
//   끊기진 않지만 측정과 다른 비싼 모델로 도므로, 부트 점검이 Sentry로 경고한다.
const taskOverrides = new Map<LlmTask, TaskOverride>([
  ["judgeRelations", { modelId: "gemini-3.1-pro-preview", effort: "low" }],
  ["narrate", { modelId: "gemini-3.1-flash-lite" }],
  ["generateDraft", { modelId: "gemini-3.1-flash-lite" }],
]);

export function getTaskOverride(task: LlmTask): TaskOverride | undefined {
  return taskOverrides.get(task);
}

export function setTaskOverride(params: {
  task: LlmTask;
  modelId: string;
  effort?: LlmEffort;
}): void {
  const { task, modelId, effort } = params;
  const spec = getModelSpec(modelId);
  if (!spec) {
    throw new LlmError(
      "bad_request",
      `Unknown model id "${modelId}" — not registered in MODEL_CATALOG`,
    );
  }
  // effort는 모델 프로바이더가 받는 값이어야 한다 — 안 먹는 값을 set 시점에 거른다.
  if (effort !== undefined && !isEffortValidFor(spec.provider, effort)) {
    throw new LlmError(
      "bad_request",
      `Effort "${effort}" is not valid for ${spec.provider} model "${modelId}"`,
    );
  }
  taskOverrides.set(task, { modelId, effort });
}

export function clearTaskOverride(task: LlmTask): void {
  taskOverrides.delete(task);
}

export function getAllTaskOverrides(): Record<LlmTask, string | null> {
  // task 목록을 TASK_DEFAULTS에서 파생 — 6번째 task가 생겨도 누락되지 않는다.
  const tasks = Object.keys(TASK_DEFAULTS) as LlmTask[];
  return Object.fromEntries(
    tasks.map((task) => [task, taskOverrides.get(task)?.modelId ?? null]),
  ) as Record<LlmTask, string | null>;
}
