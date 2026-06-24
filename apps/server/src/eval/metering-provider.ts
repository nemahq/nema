// LlmProvider를 감싸 호출마다 토큰 usage(onUsage)·지연(벽시계)을 누적하는 측정 전용 래퍼.
// 가성비 비교(NEM-149)가 cores(extraction-core·judgment-core)나 상품 경로를 건드리지 않고
// 비용·지연을 걷는 통로다. onUsage가 선택 파라미터라 감싼 provider의 동작은 불변이다.

import type {
  GenerateStreamParams,
  GenerateStructuredParams,
  GenerateTextParams,
  LlmProvider,
  LlmUsage,
} from "@server/infra/llm/llm-provider";

export interface MeteredCall {
  usage: LlmUsage;
  latencyMs: number;
  // 성공했으나 onUsage가 안 온 콜 — 비용을 0으로 둔갑시키면 안 되므로 표식한다.
  usageMissing: boolean;
}

export interface MeteringTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalLatencyMs: number;
  // usage 없이 끝난 콜 수 > 0이면 토큰 합이 과소라 비용을 신뢰할 수 없다(buildEvalRunRow가 null 처리).
  callsMissingUsage: number;
}

export interface MeteringProvider {
  provider: LlmProvider;
  totals(): MeteringTotals;
  calls(): readonly MeteredCall[];
  reset(): void;
}

const EMPTY_TOTALS: MeteringTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  totalLatencyMs: 0,
  callsMissingUsage: 0,
};

export function createMeteringProvider(inner: LlmProvider): MeteringProvider {
  const records: MeteredCall[] = [];

  // 호출별 closure에 usage를 잡아, 러너의 동시 호출(limiter)이 서로 덮지 않게 한다.
  // 호출자가 자기 onUsage를 넘겼으면 그것도 함께 호출(체이닝)해 기존 동작을 보존한다.
  function captureOnUsage(userOnUsage: GenerateTextParams["onUsage"]): {
    onUsage: (usage: LlmUsage) => void;
    captured: { usage?: LlmUsage };
  } {
    const captured: { usage?: LlmUsage } = {};
    return {
      onUsage: (usage) => {
        captured.usage = usage;
        userOnUsage?.(usage);
      },
      captured,
    };
  }

  function record(captured: { usage?: LlmUsage }, startedAt: number): void {
    records.push({
      usage: captured.usage ?? { inputTokens: 0, outputTokens: 0 },
      latencyMs: Date.now() - startedAt,
      usageMissing: captured.usage === undefined,
    });
  }

  const provider: LlmProvider = {
    async generateStructured<T>(
      params: GenerateStructuredParams<T>,
    ): Promise<T> {
      const { onUsage, captured } = captureOnUsage(params.onUsage);
      const startedAt = Date.now();
      const result = await inner.generateStructured({ ...params, onUsage });
      record(captured, startedAt);
      return result;
    },
    async generateText(params: GenerateTextParams): Promise<string> {
      const { onUsage, captured } = captureOnUsage(params.onUsage);
      const startedAt = Date.now();
      const result = await inner.generateText({ ...params, onUsage });
      record(captured, startedAt);
      return result;
    },
    async *generateStream(params: GenerateStreamParams): AsyncIterable<string> {
      const { onUsage, captured } = captureOnUsage(params.onUsage);
      const startedAt = Date.now();
      for await (const chunk of inner.generateStream({ ...params, onUsage })) {
        yield chunk;
      }
      record(captured, startedAt);
    },
  };

  return {
    provider,
    totals(): MeteringTotals {
      return records.reduce<MeteringTotals>(
        (acc, call) => ({
          calls: acc.calls + 1,
          inputTokens: acc.inputTokens + call.usage.inputTokens,
          outputTokens: acc.outputTokens + call.usage.outputTokens,
          reasoningTokens:
            acc.reasoningTokens + (call.usage.reasoningTokens ?? 0),
          cachedInputTokens:
            acc.cachedInputTokens + (call.usage.cachedInputTokens ?? 0),
          totalLatencyMs: acc.totalLatencyMs + call.latencyMs,
          callsMissingUsage:
            acc.callsMissingUsage + (call.usageMissing ? 1 : 0),
        }),
        { ...EMPTY_TOTALS },
      );
    },
    calls(): readonly MeteredCall[] {
      return records;
    },
    reset(): void {
      records.length = 0;
    },
  };
}
