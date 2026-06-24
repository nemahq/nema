import { describe, expect, it } from "vitest";

import type { LlmProvider } from "@server/infra/llm/llm-provider";

import { createMeteringProvider } from "./metering-provider";

// onUsage를 쏘는 가짜 provider — 래퍼가 그 usage를 누적하는지만 본다.
function fakeProvider(): LlmProvider {
  return {
    generateStructured: () => {
      throw new Error("unused in these tests");
    },
    generateText: async (params) => {
      params.onUsage?.({
        inputTokens: 100,
        outputTokens: 30,
        reasoningTokens: 10,
        cachedInputTokens: 5,
      });
      return "hi";
    },
    async *generateStream(params) {
      yield "a";
      yield "b";
      params.onUsage?.({ inputTokens: 50, outputTokens: 20 });
    },
  };
}

describe("createMeteringProvider", () => {
  // 래퍼가 usage를 흘리면 비교 하니스의 비용이 조용히 0이 된다 — 누적을 검증한다.
  it("accumulates usage and latency across calls", async () => {
    const meter = createMeteringProvider(fakeProvider());
    await meter.provider.generateText({
      systemPrompt: "s",
      messages: [{ role: "user", content: "q" }],
    });
    const totals = meter.totals();
    expect(totals.calls).toBe(1);
    expect(totals.inputTokens).toBe(100);
    expect(totals.outputTokens).toBe(30);
    expect(totals.reasoningTokens).toBe(10);
    expect(totals.cachedInputTokens).toBe(5);
    expect(totals.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  // 스트림은 usage가 끝에 온다 — 끝까지 소비해야 기록되는지 본다.
  it("records stream usage only after the stream is fully consumed", async () => {
    const meter = createMeteringProvider(fakeProvider());
    const chunks: string[] = [];
    for await (const chunk of meter.provider.generateStream({
      systemPrompt: "s",
      messages: [{ role: "user", content: "q" }],
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["a", "b"]);
    expect(meter.totals()).toMatchObject({
      calls: 1,
      inputTokens: 50,
      outputTokens: 20,
    });
  });

  // 측정용 onUsage 주입이 호출자 자신의 onUsage를 삼키면 안 된다(체이닝).
  it("still invokes a caller-supplied onUsage", async () => {
    const meter = createMeteringProvider(fakeProvider());
    const seen: number[] = [];
    await meter.provider.generateText({
      systemPrompt: "s",
      messages: [{ role: "user", content: "q" }],
      onUsage: (usage) => seen.push(usage.inputTokens),
    });
    expect(seen).toEqual([100]);
  });

  // usage 없이 성공한 콜은 $0로 둔갑하면 안 된다 — callsMissingUsage로 표식돼야 한다.
  it("flags a successful call that never reported usage", async () => {
    const silent: LlmProvider = {
      generateStructured: () => {
        throw new Error("unused in this test");
      },
      generateText: async () => "no usage fired",
      async *generateStream() {
        yield "";
      },
    };
    const meter = createMeteringProvider(silent);
    await meter.provider.generateText({
      systemPrompt: "s",
      messages: [{ role: "user", content: "q" }],
    });
    const totals = meter.totals();
    expect(totals.calls).toBe(1);
    expect(totals.callsMissingUsage).toBe(1);
    expect(totals.inputTokens).toBe(0);
  });
});
