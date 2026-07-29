import { afterEach, describe, expect, it } from "vitest";

import { LlmError } from "./llm-error";
import {
  clearTaskOverride,
  getAllTaskOverrides,
  getTaskOverride,
  setTaskOverride,
  TASK_DEFAULTS,
} from "./task-routing";

describe("setTaskOverride", () => {
  // 이 블록의 테스트는 generateDigests만 건드린다 — seed task를 오염시키지 않게, 인라인 clear가
  // 빠지거나 throw로 건너뛰어도 매 테스트 뒤 정리해 형제 테스트 순서 의존을 없앤다.
  afterEach(() => {
    clearTaskOverride("generateDigests");
  });

  it("throws LlmError for an uncatalogued model id", () => {
    expect(() =>
      setTaskOverride({ task: "generateDigests", modelId: "not-a-real-model" }),
    ).toThrow(LlmError);
    expect(getTaskOverride("generateDigests")).toBeUndefined();
  });

  it("accepts a known catalog id", () => {
    setTaskOverride({ task: "generateDigests", modelId: "claude-sonnet-4-6" });
    expect(getTaskOverride("generateDigests")).toEqual({
      modelId: "claude-sonnet-4-6",
    });
    clearTaskOverride("generateDigests");
  });

  it("accepts a native effort for the model's provider", () => {
    // xhigh는 Claude 어휘 — anthropic 모델에 유효하다.
    setTaskOverride({
      task: "generateDigests",
      modelId: "claude-opus-4-8",
      effort: "xhigh",
    });
    expect(getTaskOverride("generateDigests")).toEqual({
      modelId: "claude-opus-4-8",
      effort: "xhigh",
    });
    clearTaskOverride("generateDigests");
  });

  it("rejects an effort the model's provider does not accept", () => {
    // xhigh는 OpenAI가 받지 않는다 — set 시점에 거른다.
    expect(() =>
      setTaskOverride({
        task: "generateDigests",
        modelId: "gpt-5",
        effort: "xhigh",
      }),
    ).toThrow(LlmError);
    expect(getTaskOverride("generateDigests")).toBeUndefined();
  });
});

describe("기본 override 배치", () => {
  // golden contract — 커밋된 seed는 없다(전 task가 tier 기본값). 실수로 seed가 다시 박히면
  // prod가 조용히 그 모델로 새므로, "전부 null"을 통째로 못박아 오편집을 시끄러운 실패로 바꾼다.
  it("leaves every task on the tier default with no committed override", () => {
    expect(getAllTaskOverrides()).toEqual({
      generateSourceTitle: null,
      extractStatements: null,
      generateDigests: null,
      judgeRelations: null,
      draftRelationMerge: null,
      narrate: null,
      structureQuery: null,
      selectScopeTopics: null,
    });
    expect(getTaskOverride("judgeRelations")).toBeUndefined();
  });
});

describe("TASK_DEFAULTS", () => {
  // golden contract — 한 단어만 잘못 바뀌어도 비용/동작 회귀가 에러 없이 새므로,
  // 이 표를 통째로 못박아 조용한 오편집을 시끄러운 테스트 실패로 바꾼다.
  it("matches the locked tier/effort mapping exactly", () => {
    expect(TASK_DEFAULTS).toEqual({
      generateSourceTitle: { tier: "nano" },
      extractStatements: { tier: "standard", effort: "low" },
      generateDigests: { tier: "standard", effort: "low" },
      judgeRelations: { tier: "standard", effort: "low" },
      draftRelationMerge: { tier: "standard", effort: "low" },
      narrate: { tier: "standard" },
      structureQuery: { tier: "mini" },
      selectScopeTopics: { tier: "mini" },
    });
  });
});
