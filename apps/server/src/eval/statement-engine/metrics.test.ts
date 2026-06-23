import { describe, expect, it } from "vitest";

import { classificationMetrics, pointIdOf, scoreF1 } from "./metrics";

// 이 함수들이 틀리면 모든 평가 지표가 조용히 오염된다 — 측정 일지의 라운드 간
// 비교가 무의미해지는 구체적 실패를 막는 테스트.

describe("scoreF1", () => {
  it("양쪽 0개는 만점 — '추출 0개가 정답'인 잡담 글 케이스", () => {
    expect(scoreF1({ matched: 0, extracted: 0, golden: 0 })).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });

  it("골든 0개인데 추출이 있으면 과잉 추출로 precision이 0", () => {
    const score = scoreF1({ matched: 0, extracted: 3, golden: 0 });
    expect(score.precision).toBe(0);
    expect(score.recall).toBe(1);
    expect(score.f1).toBe(0);
  });

  it("추출 0개인데 골든이 있으면 누락으로 recall이 0", () => {
    const score = scoreF1({ matched: 0, extracted: 0, golden: 4 });
    expect(score.precision).toBe(1);
    expect(score.recall).toBe(0);
    expect(score.f1).toBe(0);
  });

  it("일반 케이스 — 조화 평균", () => {
    const score = scoreF1({ matched: 2, extracted: 4, golden: 2 });
    expect(score.precision).toBe(0.5);
    expect(score.recall).toBe(1);
    expect(score.f1).toBeCloseTo(2 / 3);
  });
});

describe("pointIdOf", () => {
  it("같은 골든 id는 항상 같은 point id — 결정성이 깨지면 질의의 기대 id 역추적이 전부 빗나간다", () => {
    expect(pointIdOf("meeting-memo-1-s1")).toBe(pointIdOf("meeting-memo-1-s1"));
  });

  it("Qdrant point id 제약(UUID 형식)을 지킨다", () => {
    expect(pointIdOf("transcript-1-s4a")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("다른 골든 id끼리 충돌하지 않는다", () => {
    const ids = [
      "meeting-memo-1-s1",
      "meeting-memo-1-s2",
      "transcript-1-s4a",
      "transcript-1-s4b",
    ].map(pointIdOf);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("classificationMetrics", () => {
  const TYPES = ["claim", "question", "todo"] as const;

  // 이 지표의 존재 이유 — accuracy가 다수 클래스에 가려 못 보는 소수 클래스 실패를
  // macro-F1이 드러내는지가 핵심. 이게 틀리면 분류 약점을 놓친다.
  it("accuracy는 높아도 소수 클래스가 무너지면 macro-F1이 떨어진다", () => {
    // claim 10개 전부 정답, question 2개는 전부 claim으로 오분류 → accuracy 10/12≈0.83
    const pairs = [
      ...Array.from({ length: 10 }, () => ({
        expected: "claim" as const,
        actual: "claim" as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        expected: "question" as const,
        actual: "claim" as const,
      })),
    ];
    const { perClass, macroF1 } = classificationMetrics(TYPES, pairs);

    expect(perClass.claim.recall).toBe(1);
    // question은 하나도 못 맞춤 — recall·f1 모두 0인데 accuracy엔 안 드러난다
    expect(perClass.question.recall).toBe(0);
    expect(perClass.question.f1).toBe(0);
    // macro는 claim(f1 0.909)과 question(f1 0)의 균등 평균 ≈ 0.455 — accuracy 0.83보다 훨씬 낮다
    expect(macroF1).toBeCloseTo(0.455, 3);
  });

  it("골든도 예측도 없는 클래스는 제외 — macro를 0으로 끌어내리지 않는다", () => {
    const pairs = [
      { expected: "claim" as const, actual: "claim" as const },
      { expected: "question" as const, actual: "question" as const },
    ];
    const { perClass, macroF1 } = classificationMetrics(TYPES, pairs);

    expect(perClass.todo).toEqual({
      precision: null,
      recall: null,
      f1: null,
      support: 0,
    });
    // 등장한 두 클래스 모두 완벽 → todo(미등장)를 빼고 macro = 1
    expect(macroF1).toBe(1);
  });
});
