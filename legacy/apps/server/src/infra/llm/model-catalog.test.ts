import { describe, expect, it } from "vitest";

import { computeCostUsd } from "./model-catalog";

describe("computeCostUsd", () => {
  // 단가는 per-1M라 /1_000_000을 빠뜨리면 비용이 100만 배로 튄다 — 조용히 비교 전체를 망치는 자릿수 버그를 막는다.
  it("computes USD cost from billed token usage and catalog pricing", () => {
    // gpt-5: 입력 $1.25/1M, 출력 $10/1M → (2000·1.25 + 500·10)/1e6
    const cost = computeCostUsd("gpt-5", {
      inputTokens: 2000,
      outputTokens: 500,
    });
    expect(cost).toBeCloseTo(0.0075, 10);
  });

  // 미박제 모델은 가짜 0원이 아니라 null이어야 비교 하니스가 "단가 없음"으로 표시한다.
  it("returns null for a model absent from the catalog", () => {
    expect(
      computeCostUsd("nonexistent-model", {
        inputTokens: 100,
        outputTokens: 50,
      }),
    ).toBeNull();
  });
});
