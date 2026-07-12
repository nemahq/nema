import { describe, expect, it } from "vitest";

import {
  DEFAULT_MINI_MODEL,
  DEFAULT_NANO_MODEL,
  DEFAULT_STANDARD_MODEL,
  NONPROD_DEFAULT_MINI_MODEL,
  NONPROD_DEFAULT_NANO_MODEL,
  NONPROD_DEFAULT_STANDARD_MODEL,
  resolveTierModelIds,
} from "@server/infra/llm/models";

describe("resolveTierModelIds — 프로덕션 하드 lock", () => {
  it("프로덕션에서는 LLM_MODEL_* env를 무시하고 커밋된 OpenAI 기본값을 강제한다", () => {
    // Railway env가 실수로 Gemini를 가리켜도 프로덕션 tier는 안 흔들려야 한다.
    expect(
      resolveTierModelIds({
        appEnv: "production",
        standard: "gemini-3.1-pro-preview",
        mini: "gemini-3.1-flash-lite",
        nano: "gemini-3.1-flash-lite",
      }),
    ).toEqual({
      standard: DEFAULT_STANDARD_MODEL,
      mini: DEFAULT_MINI_MODEL,
      nano: DEFAULT_NANO_MODEL,
    });
  });
});

describe("resolveTierModelIds — 비프로덕션 기본값", () => {
  it("env override가 있으면 그 값을 tier로 쓴다", () => {
    expect(
      resolveTierModelIds({ appEnv: "staging", standard: "claude-opus-4-8" }),
    ).toMatchObject({ standard: "claude-opus-4-8" });
  });

  it("env가 비면 저렴한 Google 기본값으로 떨어진다", () => {
    expect(resolveTierModelIds({ appEnv: "local" })).toEqual({
      standard: NONPROD_DEFAULT_STANDARD_MODEL,
      mini: NONPROD_DEFAULT_MINI_MODEL,
      nano: NONPROD_DEFAULT_NANO_MODEL,
    });
  });
});
