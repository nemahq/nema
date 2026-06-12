// 심판 부품 — Claude 이진 판정 (eval-design 결정 #2·#3·#4)
//
// 추출(gpt-5)과 다른 계열을 쓰는 게 핵심이라(자기선호 편향 회피, 결정 #3)
// 제품 인프라(infra/llm)에 provider를 추가하지 않고 eval 전용으로 직접 호출한다.
// 모든 판정은 이진 pass/fail — 다단 척도는 모델별 반응이 불안정(결정 #4).

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Sonnet급으로 충분: reference 동봉 + 이진 판정이라 심판 난이도가 낮다.
// 표본 검사(결정 #5)에서 어긋남이 보이면 그때 조정.
const JUDGE_MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 300;
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2_000;

const SAME_MEANING_SYSTEM_PROMPT = `You compare two statements extracted from a personal note and decide whether they express the same single piece of information.

Answer "same": true if both convey the same decision, fact, question, or task about the same subject. Judge the core information, not the wording:

- Phrasing, word choice, politeness, reporting form ("the customer is satisfied" vs "the customer said they are satisfied") do not matter.
- Qualifiers that are obvious from shared context ("the first customer" vs "the first interview customer", with vs without "with the product") do not matter.
- An open issue phrased as a question vs as "need to consider X" is the same information.

Differences that DO matter: a different subject, a different polarity (affirmed vs negated), or genuinely different information. A statement bundling an extra independent fact (one that could stand as its own statement) is NOT the same — but extra attribution or connective phrasing is fine.

Output JSON only: {"same": boolean, "reason": "<one short sentence>"}`;

// 차원 정의는 ingestion-design 절단 원칙 1~3 + eval-design 결정 #8을 그대로 옮긴 것
const DIMENSION_SYSTEM_PROMPTS = {
  atomicity: `You judge one statement extracted from a note. Question: does it contain exactly ONE unit of meaning — one decision, one fact, one question, or one task?

Fail if it bundles two pieces of information that could be searched for separately or could become outdated separately (e.g., a decision plus an unrelated status, two parallel facts joined by "and", a status plus a scheduled date).

Exception: a reason-link statement ("the reason for choosing X is Y") is ONE unit — the link itself is the information. Do not fail it for mentioning both the decision and the reason. Likewise a task with its deadline is ONE unit.

Output JSON only: {"pass": boolean, "reason": "<one short sentence>"}`,
  selfContained: `You judge one statement extracted from a note. Question: can it be fully understood on its own, without reading the note?

Fail if it contains unresolved pronouns or references ("it", "that plan", "him", "그 건") whose referent the note makes clear, or if essential context is missing so the statement is ambiguous standing alone.

These are personal notes: first person ("I", "we", "나", "내가", "우리") refers to the note's author and their team — that is self-contained, do not fail it.

Output JSON only: {"pass": boolean, "reason": "<one short sentence>"}`,
  faithfulness: `You judge one statement extracted from a note, with the original note provided. Question: is the statement faithful to the note?

Fail if it states anything the note does not say, or expresses MORE certainty than the note does (e.g., the note hedges with "maybe / ~인 것 같다" but the statement asserts it flatly). Polished wording and resolved pronouns are fine — added information is not.

Output JSON only: {"pass": boolean, "reason": "<one short sentence>"}`,
} as const;

type QualityDimension = keyof typeof DIMENSION_SYSTEM_PROMPTS;

export const QUALITY_DIMENSIONS = Object.keys(
  DIMENSION_SYSTEM_PROMPTS,
) as QualityDimension[];

export interface JudgeVerdict {
  pass: boolean;
  reason: string;
}

export interface JudgeUsage {
  apiCalls: number;
  shortCircuits: number;
  inputTokens: number;
  outputTokens: number;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

function normalizeForExactMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// 모델이 JSON 뒤에 사족을 붙이거나 재고 후 새 JSON을 내기도 한다 —
// 균형 잡힌 최상위 {...} 후보를 모아 마지막 파싱 가능한 객체(최종 답)를 쓴다
function parseJsonObject(text: string): Record<string, unknown> {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  for (const [index, char] of [...text].entries()) {
    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  for (const candidate of candidates.reverse()) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // 다음 후보 시도
    }
  }
  throw new Error(`Judge returned no parseable JSON: ${text.slice(0, 200)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 동시 호출 상한 — 외부 의존성 없이 작은 세마포어로 */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

export interface QualityJudgeParams {
  dimension: QualityDimension;
  source: string;
  statement: string;
}

export interface Judge {
  /** 두 진술이 같은 의미인가 — 골든 대조·일관성 매칭의 공용 부품 */
  sameMeaning(a: string, b: string): Promise<JudgeVerdict>;
  /** 원문 동봉 품질 판정 — 원자성·자기완결·충실성 */
  quality(params: QualityJudgeParams): Promise<JudgeVerdict>;
  usage(): JudgeUsage;
}

export function createJudge(apiKey: string, concurrency: number): Judge {
  const limit = createLimiter(concurrency);
  // 같은 문장 쌍의 재판정 제거 — 반복 실행(일관성 측정)은 동일 문장이 많이 겹친다.
  // 판정은 대칭이므로 키도 순서 무관. Promise를 캐시해 동시 중복 호출도 합쳐진다.
  const sameMeaningCache = new Map<string, Promise<JudgeVerdict>>();
  const usage: JudgeUsage = {
    apiCalls: 0,
    shortCircuits: 0,
    inputTokens: 0,
    outputTokens: 0,
  };

  async function callOnce(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const retriable =
        response.status === 429 ||
        response.status === 529 ||
        response.status >= 500;
      const error = new Error(
        `Anthropic API ${response.status}: ${errorBody.slice(0, 200)}`,
      );
      (error as Error & { retriable?: boolean }).retriable = retriable;
      throw error;
    }

    const judgeResponse = (await response.json()) as AnthropicResponse;
    usage.apiCalls += 1;
    usage.inputTokens += judgeResponse.usage?.input_tokens ?? 0;
    usage.outputTokens += judgeResponse.usage?.output_tokens ?? 0;

    const text = judgeResponse.content.find(
      (block) => block.type === "text",
    )?.text;
    if (!text) {
      throw new Error("Anthropic API returned no text block");
    }
    return text;
  }

  async function callWithRetry(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        return await limit(() => callOnce(systemPrompt, userContent));
      } catch (error) {
        lastError = error;
        const retriable =
          error instanceof Error &&
          (error as Error & { retriable?: boolean }).retriable;
        if (!retriable) {
          throw error;
        }
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }
    throw lastError;
  }

  return {
    async sameMeaning(a: string, b: string): Promise<JudgeVerdict> {
      const normalizedA = normalizeForExactMatch(a);
      const normalizedB = normalizeForExactMatch(b);
      if (normalizedA === normalizedB) {
        usage.shortCircuits += 1;
        return { pass: true, reason: "exact match" };
      }
      const cacheKey = JSON.stringify([normalizedA, normalizedB].sort());
      const cached = sameMeaningCache.get(cacheKey);
      if (cached) {
        usage.shortCircuits += 1;
        return cached;
      }
      const verdictPromise = callWithRetry(
        SAME_MEANING_SYSTEM_PROMPT,
        `Statement A: ${a}\nStatement B: ${b}`,
      ).then((text) => {
        const parsed = parseJsonObject(text);
        return {
          pass: parsed["same"] === true,
          reason: String(parsed["reason"] ?? ""),
        };
      });
      sameMeaningCache.set(cacheKey, verdictPromise);
      return verdictPromise;
    },

    async quality(params: QualityJudgeParams): Promise<JudgeVerdict> {
      const text = await callWithRetry(
        DIMENSION_SYSTEM_PROMPTS[params.dimension],
        `<note>${params.source}</note>\n\nStatement: ${params.statement}`,
      );
      const parsed = parseJsonObject(text);
      return {
        pass: parsed["pass"] === true,
        reason: String(parsed["reason"] ?? ""),
      };
    },

    usage(): JudgeUsage {
      return { ...usage };
    },
  };
}
