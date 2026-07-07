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
  // 이 블록의 테스트는 assistDraft만 건드린다 — seed task를 오염시키지 않게, 인라인 clear가
  // 빠지거나 throw로 건너뛰어도 매 테스트 뒤 정리해 형제 테스트 순서 의존을 없앤다.
  afterEach(() => {
    clearTaskOverride("assistDraft");
  });

  it("throws LlmError for an uncatalogued model id", () => {
    expect(() =>
      setTaskOverride({ task: "assistDraft", modelId: "not-a-real-model" }),
    ).toThrow(LlmError);
    expect(getTaskOverride("assistDraft")).toBeUndefined();
  });

  it("accepts a known catalog id", () => {
    setTaskOverride({ task: "assistDraft", modelId: "claude-sonnet-4-6" });
    expect(getTaskOverride("assistDraft")).toEqual({
      modelId: "claude-sonnet-4-6",
    });
    clearTaskOverride("assistDraft");
  });

  it("accepts a native effort for the model's provider", () => {
    // xhigh는 Claude 어휘 — anthropic 모델에 유효하다.
    setTaskOverride({
      task: "assistDraft",
      modelId: "claude-opus-4-8",
      effort: "xhigh",
    });
    expect(getTaskOverride("assistDraft")).toEqual({
      modelId: "claude-opus-4-8",
      effort: "xhigh",
    });
    clearTaskOverride("assistDraft");
  });

  it("rejects an effort the model's provider does not accept", () => {
    // xhigh는 OpenAI가 받지 않는다 — set 시점에 거른다.
    expect(() =>
      setTaskOverride({
        task: "assistDraft",
        modelId: "gpt-5",
        effort: "xhigh",
      }),
    ).toThrow(LlmError);
    expect(getTaskOverride("assistDraft")).toBeUndefined();
  });
});

describe("기본 모델 배치 (NEM-149)", () => {
  // golden contract — 가성비 측정으로 박은 배치다. seed가 조용히 빠지면 라우팅이 gpt-5 tier로
  // 되돌아가 비용/품질이 새므로, 표를 통째로 못박아 오편집을 시끄러운 실패로 바꾼다.
  it("seeds the cost-effectiveness placement and leaves others on the tier default", () => {
    expect(getAllTaskOverrides()).toEqual({
      judgeRelations: "gemini-3.1-pro-preview",
      narrate: "gemini-3.1-flash-lite",
      generateDraft: "gemini-3.1-flash-lite",
      extractStatements: null,
      // 신규 task — 가성비 측정 전이라 seed 없이 tier 기본값(standard)로 시작
      generateDigests: null,
      classifyDraftIntent: null,
      generateSessionTitle: null,
      assistDraft: null,
      structureQuery: null,
      selectScopeTopics: null,
    });
    expect(getTaskOverride("judgeRelations")).toEqual({
      modelId: "gemini-3.1-pro-preview",
      effort: "low",
    });
    // toEqual은 정확 일치 — narrate/draft에 effort가 없음을 못박는다(스트레이 effort가 조용히
    // 새지 않게). 관계만 effort를 둔 건 측정과 맞추기 위함이다.
    expect(getTaskOverride("narrate")).toEqual({
      modelId: "gemini-3.1-flash-lite",
    });
    expect(getTaskOverride("generateDraft")).toEqual({
      modelId: "gemini-3.1-flash-lite",
    });
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
      generateDigests: { tier: "standard", effort: "low" },
      judgeRelations: { tier: "standard", effort: "low" },
      assistDraft: { tier: "standard" },
      narrate: { tier: "standard" },
      structureQuery: { tier: "mini" },
      selectScopeTopics: { tier: "mini" },
    });
  });
});
