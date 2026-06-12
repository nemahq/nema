import { describe, expect, it } from "vitest";

import { pointIdOf, scoreF1 } from "./metrics";

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
