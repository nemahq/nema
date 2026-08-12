import { afterEach, describe, expect, it } from "vitest";

import { LlmError } from "@server/infra/llm/llm-error";
import { DIGEST_GENERATION_MODEL_OPENAI } from "@server/infra/llm/models";
import {
  clearTaskOverride,
  resolveModelId,
  setTaskOverride,
} from "@server/infra/llm/task-routing";

describe("resolveModelId", () => {
  afterEach(() => {
    clearTaskOverride("generateDigests");
  });

  // golden contract — 실수로 기본값이 바뀌면 다이제스트 생성 비용/품질이 조용히
  // 새므로, 지금 배치된 모델을 못박아 오편집을 시끄러운 실패로 바꾼다.
  it("defaults to the committed OpenAI model with no override", () => {
    expect(resolveModelId("generateDigests")).toBe(
      DIGEST_GENERATION_MODEL_OPENAI,
    );
  });

  it("returns the overridden model id once set", () => {
    setTaskOverride("generateDigests", "gemini-3.1-flash-lite");
    expect(resolveModelId("generateDigests")).toBe("gemini-3.1-flash-lite");
  });

  it("reverts to the default once the override is cleared", () => {
    setTaskOverride("generateDigests", "gemini-3.1-flash-lite");
    clearTaskOverride("generateDigests");
    expect(resolveModelId("generateDigests")).toBe(
      DIGEST_GENERATION_MODEL_OPENAI,
    );
  });

  it("throws LlmError for an uncatalogued model id and leaves the existing resolution untouched", () => {
    expect(() =>
      setTaskOverride("generateDigests", "not-a-real-model"),
    ).toThrow(LlmError);
    expect(resolveModelId("generateDigests")).toBe(
      DIGEST_GENERATION_MODEL_OPENAI,
    );
  });
});
