import { describe, expect, it } from "vitest";

import { LlmError } from "./llm-error";
import {
  clearTaskOverride,
  getTaskOverride,
  setTaskOverride,
  TASK_DEFAULTS,
} from "./task-routing";

describe("setTaskOverride", () => {
  it("throws LlmError for an uncatalogued model id", () => {
    expect(() =>
      setTaskOverride({ task: "generateDraft", modelId: "not-a-real-model" }),
    ).toThrow(LlmError);
    expect(getTaskOverride("generateDraft")).toBeUndefined();
  });

  it("accepts a known catalog id", () => {
    setTaskOverride({ task: "generateDraft", modelId: "claude-sonnet-4-6" });
    expect(getTaskOverride("generateDraft")).toEqual({
      modelId: "claude-sonnet-4-6",
    });
    clearTaskOverride("generateDraft");
  });

  it("accepts a native effort for the model's provider", () => {
    // xhigh는 Claude 어휘 — anthropic 모델에 유효하다.
    setTaskOverride({
      task: "generateDraft",
      modelId: "claude-opus-4-8",
      effort: "xhigh",
    });
    expect(getTaskOverride("generateDraft")).toEqual({
      modelId: "claude-opus-4-8",
      effort: "xhigh",
    });
    clearTaskOverride("generateDraft");
  });

  it("rejects an effort the model's provider does not accept", () => {
    // xhigh는 OpenAI가 받지 않는다 — set 시점에 거른다.
    expect(() =>
      setTaskOverride({
        task: "generateDraft",
        modelId: "gpt-5",
        effort: "xhigh",
      }),
    ).toThrow(LlmError);
    expect(getTaskOverride("generateDraft")).toBeUndefined();
  });
});

describe("TASK_DEFAULTS", () => {
  // golden contract — 한 단어만 잘못 바뀌어도 비용/동작 회귀가 에러 없이 새므로,
  // 이 표를 통째로 못박아 조용한 오편집을 시끄러운 테스트 실패로 바꾼다.
  it("matches the locked tier/effort mapping exactly", () => {
    expect(TASK_DEFAULTS).toEqual({
      generateDraft: { tier: "standard" },
      classifyDraftIntent: { tier: "mini" },
      generateSessionTitle: { tier: "nano" },
      extractStatements: { tier: "standard", effort: "low" },
      judgeRelations: { tier: "standard", effort: "low" },
      assistDraft: { tier: "standard" },
      narrate: { tier: "standard" },
    });
  });
});
