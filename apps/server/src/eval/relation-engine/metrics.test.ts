import { describe, expect, it } from "vitest";

import {
  appliedFalsePositives,
  type GatedRelation,
  relationKey,
  type RelationTriple,
  scorePredictions,
  tallyByType,
} from "./metrics";

// 채점 로직이 틀리면 supports FP 헤드라인 숫자가 통째로 거짓이 된다 — 전후 비교가
// 무의미해지는 구체적 실패를 막는 테스트.

describe("relationKey", () => {
  it("conflicts는 대칭 — 방향만 다른 두 쌍이 같은 키", () => {
    expect(relationKey({ from: "a", to: "b", type: "conflicts" })).toBe(
      relationKey({ from: "b", to: "a", type: "conflicts" }),
    );
  });

  it("방향 있는 종류는 방향을 보존 — 뒤집으면 다른 키", () => {
    expect(relationKey({ from: "a", to: "b", type: "supports" })).not.toBe(
      relationKey({ from: "b", to: "a", type: "supports" }),
    );
  });
});

describe("scorePredictions", () => {
  const golden: RelationTriple[] = [
    { from: "s2", to: "s1", type: "supports" },
    { from: "s1", to: "e1", type: "replaces" },
    { from: "s3", to: "e2", type: "conflicts" },
  ];

  it("type·방향까지 맞으면 TP, conflicts는 방향 무관하게 TP", () => {
    const predictions: GatedRelation[] = [
      { from: "s2", to: "s1", type: "supports", gate: "applied" },
      { from: "e2", to: "s3", type: "conflicts", gate: "pending" }, // 역방향이지만 대칭
    ];
    const result = scorePredictions({ predictions, golden });
    expect(result.counts.truePositive).toBe(2);
    expect(result.counts.falsePositive).toBe(0);
  });

  it("골든에 없는 예측은 FP(지어낸 관계)", () => {
    const predictions: GatedRelation[] = [
      { from: "e3", to: "s1", type: "supports", gate: "applied" },
    ];
    const result = scorePredictions({ predictions, golden });
    expect(result.counts.falsePositive).toBe(1);
    expect(result.counts.truePositive).toBe(0);
  });

  it("type·끝점은 맞고 방향만 뒤집힌 예측은 direction-error (TP도 FP도 아님)", () => {
    const predictions: GatedRelation[] = [
      { from: "s1", to: "s2", type: "supports", gate: "applied" }, // 골든은 s2→s1
    ];
    const result = scorePredictions({ predictions, golden });
    expect(result.counts.directionError).toBe(1);
    expect(result.counts.truePositive).toBe(0);
    expect(result.counts.falsePositive).toBe(0);
    // 방향 틀린 골든은 direction-error 버킷이 가져가므로 missed에서 빠진다 — 남은 2개만 missed.
    // (재현율 분모는 tp + missed + directionError라 골든 3개가 그대로 반영된다.)
    expect(result.counts.missed).toBe(2);
  });

  it("아무것도 예측 안 하면 골든 전부 missed", () => {
    const result = scorePredictions({ predictions: [], golden });
    expect(result.counts.missed).toBe(3);
    expect(result.counts.truePositive).toBe(0);
  });

  it("침묵해야 할 묶음(골든 0개)에서 무엇이든 내면 전부 FP", () => {
    const predictions: GatedRelation[] = [
      { from: "s1", to: "e1", type: "supports", gate: "applied" },
    ];
    const result = scorePredictions({ predictions, golden: [] });
    expect(result.counts.falsePositive).toBe(1);
    expect(result.counts.missed).toBe(0);
  });
});

describe("tallyByType", () => {
  it("종류별로 TP/FP/missed를 가른다 — supports FP가 헤드라인", () => {
    const golden: RelationTriple[] = [
      { from: "s2", to: "s1", type: "supports" },
    ];
    const predictions: GatedRelation[] = [
      { from: "s2", to: "s1", type: "supports", gate: "applied" }, // TP
      { from: "e9", to: "s1", type: "supports", gate: "applied" }, // FP (지어냄)
    ];
    const result = scorePredictions({ predictions, golden });
    const tally = tallyByType([result]);
    expect(tally["supports"]).toEqual({
      truePositive: 1,
      falsePositive: 1,
      missed: 0,
      directionError: 0,
    });
  });
});

describe("appliedFalsePositives", () => {
  it("게이트가 applied로 통과시킨 FP만 추린다 — 조용히 박힌 가짜 관계", () => {
    const golden: RelationTriple[] = [];
    const predictions: GatedRelation[] = [
      { from: "s1", to: "e1", type: "supports", gate: "applied" }, // 조용히 박힘 (해로움)
      { from: "s2", to: "e2", type: "supports", gate: "pending" }, // 사람이 거를 수 있음
    ];
    const result = scorePredictions({ predictions, golden });
    const applied = appliedFalsePositives([result]);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.gate).toBe("applied");
    expect(applied[0]?.from).toBe("s1");
  });
});
