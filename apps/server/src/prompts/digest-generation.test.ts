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
          alternatives: [
            { option: "대안 A", rejectionReason: "비용" },
            { option: "대안 B", rejectionReason: "일정" },
          ],
        },
      ],
    });

    expect(result[0]?.body).toEqual({
      choice: "선택",
      tradeoff: ["속도"],
      alternatives: [
        { option: "대안 A", rejectionReason: "비용" },
        { option: "대안 B", rejectionReason: "일정" },
      ],
    });
  });

  // 바깥 칸만 걸러내면 { option, rejectionReason: null }이 그대로 남아 body 스키마
  // parse에서 터진다 — 기각 이유를 원문이 말 안 한 대안이 흔하므로 상시 경로다.
  it("drops null fields nested inside an option, keeping the option itself", () => {
    const result = flattenGeneratedDigests({
      ...empty(),
      decisions: [
        {
          title: "제목",
          choice: "선택",
          situation: null,
          reason: null,
          tradeoff: null,
          alternatives: [
            { option: "대안 A", rejectionReason: null },
            { option: "대안 B", rejectionReason: "비용" },
          ],
        },
      ],
    });

    expect(result[0]?.body).toEqual({
      choice: "선택",
      alternatives: [
        { option: "대안 A" },
        { option: "대안 B", rejectionReason: "비용" },
      ],
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
          alternatives: [{ option: "대안 A", rejectionReason: "" }],
        },
      ],
    });

    expect(result[0]?.body).toEqual({
      choice: "선택",
      situation: "상황",
      alternatives: [{ option: "대안 A" }],
    });
  });

  it("flattens every type's array into one list, matched to the right type", () => {
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
      learnings: [{ title: "학습", finding: "F", evidence: null }],
      ideas: [
        { title: "아이디어", concept: "C", background: null, branches: null },
      ],
      assumptions: [
        {
          title: "가정",
          assumption: "A",
          evidence: null,
          impact: null,
          verificationCondition: null,
        },
      ],
    });

    // 유형별 배열 키(decisions 등)와 저장용 type 값(decision 등)의 매핑이
    // 뒤바뀌면(예: ideas가 "learning"으로 잘못 매핑) 여기서 잡힌다 — 다섯
    // 유형 전부에 항목을 하나씩 채워야, 매핑이 어긋나도 우연히 body 모양이
    // 같아서 통과하는 경우가 없다.
    expect(result.map((d) => d.type)).toEqual([
      "decision",
      "pending",
      "learning",
      "idea",
      "assumption",
    ]);
  });

  it("produces an empty list when nothing was generated", () => {
    expect(flattenGeneratedDigests(empty())).toEqual([]);
  });
});
