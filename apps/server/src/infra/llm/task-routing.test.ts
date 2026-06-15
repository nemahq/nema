import { describe, expect, it } from "vitest";

import { LlmError } from "./llm-error";
import {
  clearTaskOverride,
  getTaskOverride,
  setTaskOverride,
  TASK_DEFAULT_TIER,
} from "./task-routing";

describe("setTaskOverride", () => {
  it("throws LlmError for an uncatalogued model id", () => {
    expect(() => setTaskOverride("drafting", "not-a-real-model")).toThrow(
      LlmError,
    );
    expect(getTaskOverride("drafting")).toBeUndefined();
  });

  it("accepts a known catalog id", () => {
    setTaskOverride("drafting", "claude-sonnet-4-6");
    expect(getTaskOverride("drafting")).toBe("claude-sonnet-4-6");
    clearTaskOverride("drafting");
  });
});

describe("TASK_DEFAULT_TIER", () => {
  // golden contract — 한 단어만 잘못 바뀌어도 비용/동작 회귀가 에러 없이 새므로,
  // 이 표를 통째로 못박아 조용한 오편집을 시끄러운 테스트 실패로 바꾼다.
  it("matches the locked tier mapping exactly", () => {
    expect(TASK_DEFAULT_TIER).toEqual({
      drafting: "standard",
      draftIntent: "mini",
      sessionTitle: "nano",
      extraction: "standard",
      relationJudgment: "standard",
    });
  });
});
