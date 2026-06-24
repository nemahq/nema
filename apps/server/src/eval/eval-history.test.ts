import { describe, expect, it } from "vitest";

import { buildEvalRunRow } from "./eval-history";
import type { MeteringTotals } from "./metering-provider";

function totals(over: Partial<MeteringTotals>): MeteringTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalLatencyMs: 0,
    callsMissingUsage: 0,
    ...over,
  };
}

const base = {
  model: "gpt-5",
  provider: "openai" as const,
  task: "extractStatements" as const,
  runAt: "2026-06-24T00:00:00.000Z",
  evalVersion: "ev1",
  promptVersion: "pv1",
  qualityScore: 0.9,
  selfPreference: false,
};

describe("buildEvalRunRow", () => {
  // 비용·지연은 동작당 평균 — 합산을 호출 수로 나눈다(B의 동작당 grain과 맞추려고).
  it("averages cost and latency per call", () => {
    const row = buildEvalRunRow({
      ...base,
      totals: totals({
        calls: 2,
        inputTokens: 4000,
        outputTokens: 1000,
        totalLatencyMs: 4000,
      }),
    });
    // gpt-5: (4000·$1.25 + 1000·$10)/1e6 = $0.015 총비용 → /2콜
    expect(row.costUsd).toBeCloseTo(0.0075, 10);
    expect(row.latencyMs).toBe(2000);
    expect(row.signals.calls).toBe(2);
  });

  // usage 빠진 콜이 섞이면 토큰 합이 과소 — 가짜 $0가 모델을 "공짜"로 줄세우면 안 된다.
  it("nulls cost when a call reported no usage", () => {
    const row = buildEvalRunRow({
      ...base,
      totals: totals({
        calls: 2,
        inputTokens: 4000,
        outputTokens: 1000,
        callsMissingUsage: 1,
      }),
    });
    expect(row.costUsd).toBeNull();
    expect(row.signals.usageMissing).toBe(1);
  });

  // 콜이 0이면 아무것도 안 잰 것 — Math.max(calls,1) 가드가 만드는 합성 $0/0ms 행을 막는다.
  it("nulls cost for a zero-call run", () => {
    const row = buildEvalRunRow({ ...base, totals: totals({ calls: 0 }) });
    expect(row.costUsd).toBeNull();
  });

  // 단가 미박제 모델은 가짜 0이 아니라 null.
  it("nulls cost for an unpriced model", () => {
    const row = buildEvalRunRow({
      ...base,
      model: "unpriced-model",
      totals: totals({ calls: 1, inputTokens: 100, outputTokens: 50 }),
    });
    expect(row.costUsd).toBeNull();
  });
});
