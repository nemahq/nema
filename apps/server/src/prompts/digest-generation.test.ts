import { describe, expect, it } from "vitest";

import type { GeneratedDigests } from "@server/prompts/digest-generation";
import { flattenGeneratedDigests } from "@server/prompts/digest-generation";

function empty(): GeneratedDigests {
  return {
    decisions: [],
    pendings: [],
    learnings: [],
    ideas: [],
    assumptions: [],
  };
}

describe("flattenGeneratedDigests", () => {
  it("drops null optional fields and keeps the required + filled ones", () => {
    const result = flattenGeneratedDigests({
      ...empty(),
      decisions: [
        {
          title: "제목",
          choice: "선택",
          situation: "상황",
          reason: null,
          tradeoff: null,
          alternatives: null,
        },
      ],
    });

    expect(result).toEqual([
      {
        type: "decision",
        title: "제목",
        body: { choice: "선택", situation: "상황" },
      },
    ]);
  });

  it("produces a body with only the required field when nothing else was stated", () => {
    const result = flattenGeneratedDigests({
      ...empty(),
      learnings: [{ title: "제목", finding: "발견", evidence: null }],
    });

    expect(result[0]?.body).toEqual({ finding: "발견" });
  });

  it("keeps array fields as-is when filled", () => {
    const result = flattenGeneratedDigests({
      ...empty(),
      decisions: [
        {
          title: "제목",
          choice: "선택",
          situation: null,
          reason: null,
          tradeoff: ["속도"],
          alternatives: ["대안 A", "대안 B"],
        },
      ],
    });

    expect(result[0]?.body).toEqual({
      choice: "선택",
      tradeoff: ["속도"],
      alternatives: ["대안 A", "대안 B"],
    });
  });

  // 프롬프트가 "빈 값은 null"을 지시해도 구조화 출력에서 ""나 []가 새어 나오는
  // 경우가 실제로 있다 — null만 걸러내면 이런 값이 "채워진 칸"으로 그대로 저장된다.
  it("treats empty strings and empty arrays in optional fields as unfilled", () => {
    const result = flattenGeneratedDigests({
      ...empty(),
      decisions: [
        {
          title: "제목",
          choice: "선택",
          situation: "상황",
          reason: "",
          tradeoff: [],
          alternatives: ["대안 A"],
        },
      ],
    });

    expect(result[0]?.body).toEqual({
      choice: "선택",
      situation: "상황",
      alternatives: ["대안 A"],
    });
  });

  it("flattens every type's array into one list", () => {
    const result = flattenGeneratedDigests({
      decisions: [
        {
          title: "결정",
          choice: "A",
          situation: null,
          reason: null,
          tradeoff: null,
          alternatives: null,
        },
      ],
      pendings: [
        {
          title: "미결",
          question: "Q",
          background: null,
          branches: null,
          resolutionCondition: null,
        },
      ],
      learnings: [],
      ideas: [],
      assumptions: [],
    });

    expect(result.map((d) => d.type)).toEqual(["decision", "pending"]);
  });

  it("produces an empty list when nothing was generated", () => {
    expect(flattenGeneratedDigests(empty())).toEqual([]);
  });
});
