import { describe, expect, it } from "vitest";

import type { GeneratedDigest } from "@server/prompts/digest-generation";

import { buildDigestBody, normalizeGeneratedDigests } from "./digestion";

function makeGeneratedDigest(
  overrides: Partial<GeneratedDigest> = {},
): GeneratedDigest {
  return {
    type: "decision",
    title: "배포 도구는 A로 결정",
    description: "팀 숙련도를 근거로 배포 도구를 A로 정했다",
    situation: "배포 도구를 골라야 했다",
    choice: "A",
    reason: "팀이 이미 익숙하다",
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
    topics: [],
    tags: [],
    existingReferenceLabels: [],
    newReferenceKeys: [],
    externalUrls: [],
    ...overrides,
  };
}

describe("buildDigestBody", () => {
  it("타입 밖 필드를 버린다 — LLM이 null 지시를 어겨도 DB에 새지 않는다", () => {
    const body = buildDigestBody(
      makeGeneratedDigest({
        type: "learning",
        finding: "고객은 온보딩에서 이탈한다",
        evidence: "세 명의 인터뷰",
        // decision 필드가 채워져 와도 learning body엔 없어야 한다
        choice: "A",
        reason: "이유",
      }),
    );

    expect(body).toEqual({
      type: "learning",
      finding: "고객은 온보딩에서 이탈한다",
      evidence: "세 명의 인터뷰",
    });
  });

  it("빈 문자열·공백 필드는 값 없음으로 취급한다", () => {
    const body = buildDigestBody(
      makeGeneratedDigest({
        situation: "  ",
        choice: "A",
        reason: null,
        tradeoff: ["", "  "],
      }),
    );

    expect(body).toEqual({ type: "decision", choice: "A" });
  });
});

describe("normalizeGeneratedDigests", () => {
  const emptyContext = {
    labelToId: new Map<string, string>(),
    existingTags: [],
  };

  it("환각 레퍼런스 라벨은 버리고 실재 라벨만 id로 해석한다", () => {
    const labelToId = new Map([["E0", "11111111-1111-1111-1111-111111111111"]]);
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [
          makeGeneratedDigest({
            existingReferenceLabels: ["E0", "E7", "E0"],
          }),
        ],
        newReferences: [],
      },
      { labelToId, existingTags: [] },
    );

    expect(digests[0]?.reference_ids).toEqual([
      "11111111-1111-1111-1111-111111111111",
    ]);
  });

  it("어떤 Digest도 인용하지 않는 신규 레퍼런스 제안은 버린다", () => {
    const { digests, newReferences } = normalizeGeneratedDigests(
      {
        digests: [makeGeneratedDigest({ newReferenceKeys: ["R1"] })],
        newReferences: [
          { key: "R1", type: "person", title: "김 대리", body: "동료" },
          { key: "R2", type: "term", title: "고아 용어", body: "미인용" },
        ],
      },
      emptyContext,
    );

    expect(digests[0]?.new_reference_keys).toEqual(["R1"]);
    expect(newReferences.map((reference) => reference.key)).toEqual(["R1"]);
  });

  it("모르는 신규 레퍼런스 키 인용은 버린다 — 끊긴 키가 확정 시 유령 인용이 된다", () => {
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [makeGeneratedDigest({ newReferenceKeys: ["R9"] })],
        newReferences: [],
      },
      emptyContext,
    );

    expect(digests[0]?.new_reference_keys).toEqual([]);
  });

  it("정의 없는 태그는 레지스트리 정의로 보충하고, 그래도 없으면 버린다", () => {
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [
          makeGeneratedDigest({
            tags: [
              { title: "기술결정", description: "" },
              { title: "정의없는신규", description: "" },
            ],
          }),
        ],
        newReferences: [],
      },
      {
        labelToId: new Map(),
        existingTags: [
          { title: "기술결정", description: "기술 스택·도구 선택의 근거" },
        ],
      },
    );

    expect(digests[0]?.tags).toEqual([
      { title: "기술결정", description: "기술 스택·도구 선택의 근거" },
    ]);
  });

  it("URL이 아닌 문자열과 http(s) 밖 스킴은 버린다", () => {
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [
          makeGeneratedDigest({
            externalUrls: [
              "https://example.com/doc",
              "노션 페이지 참고",
              "javascript:alert(1)",
            ],
          }),
        ],
        newReferences: [],
      },
      emptyContext,
    );

    expect(digests[0]?.external_urls).toEqual(["https://example.com/doc"]);
  });
});
