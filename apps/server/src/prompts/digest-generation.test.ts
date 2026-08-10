import { describe, expect, it } from "vitest";

import type { GeneratedDigest } from "@server/prompts/digest-generation";
import { normalizeDigest } from "@server/prompts/digest-generation";

function blankGenerated(overrides: Partial<GeneratedDigest>): GeneratedDigest {
  return {
    type: "decision",
    title: "제목",
    situation: null,
    choice: null,
    reason: null,
    tradeoff: null,
    alternatives: null,
    question: null,
    background: null,
    branches: null,
    resolutionCondition: null,
    finding: null,
    evidence: null,
    concept: null,
    assumption: null,
    impact: null,
    verificationCondition: null,
    ...overrides,
  };
}

describe("normalizeDigest", () => {
  it("drops null fields and keeps only the filled ones", () => {
    const result = normalizeDigest(
      blankGenerated({ type: "decision", situation: "상황", choice: "선택" }),
    );

    expect(result.body).toEqual({ situation: "상황", choice: "선택" });
  });

  it("produces an empty body when the note stated nothing for this judgment", () => {
    const result = normalizeDigest(blankGenerated({ type: "learning" }));

    expect(result.body).toEqual({});
  });

  // 프롬프트 규칙 5("Fields that do not belong to the digest's type MUST be
  // null")를 LLM이 어겨도 저장되는 jsonb에 다른 유형 칸이 섞여 들어가면 안 된다 —
  // 유형별 zod 스키마의 기본 strip이 이 방어선이다.
  it("strips fields that don't belong to the digest's type even if the LLM filled them", () => {
    const result = normalizeDigest(
      blankGenerated({
        type: "idea",
        concept: "아이디어",
        // "idea"가 아니라 "pending"에 속하는 칸 — 실수로 채워진 경우를 가정한다.
        resolutionCondition: "이렇게 되면 확정",
      }),
    );

    expect(result.body).toEqual({ concept: "아이디어" });
  });

  it("keeps array fields as-is when filled", () => {
    const result = normalizeDigest(
      blankGenerated({
        type: "decision",
        tradeoff: ["속도"],
        alternatives: ["대안 A", "대안 B"],
      }),
    );

    expect(result.body).toEqual({
      tradeoff: ["속도"],
      alternatives: ["대안 A", "대안 B"],
    });
  });
});
