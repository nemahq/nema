// 해설 마커 누락률 러너 — 산문이 문장마다 [s:<id>] 근거 마커를 다는지(narration 규칙 2),
// 안 단 문장 비율을 순수 기계적으로 잰다. judge 불필요 — 충실성 누수의 싼 조기경보(§3가 정한
// "해설의 유일한 자동 신호"). 정식 해설 평가셋은 후속(narration-design 9장).
//
// 분모 = 답변가능 묶음만(근거가 있는 입력). 그땐 규칙 2상 모든 문장이 마커를 가져야 하므로
// 마커 없는 문장 = 진짜 누락. "근거 없음" 인정(규칙 3)은 마커 없는 게 정상이라 시험지에서 뺀다
// (그 신호는 eval-narration.ts의 수동 눈검사 몫).
//
// 실행: apps/server에서  pnpm tsx src/eval/run-narration-markers.ts
//   --runs N : 묶음당 N회 (기본 5 — run 간 마커 흘림 변동을 드러내려면 단발 금지, 측정 #5·#7 교훈)
// 모델: createEvalLlm (EVAL_LLM_MODEL). 제품과 동일한 NARRATION_SYSTEM_PROMPT·buildNarrationUserMessage를 탄다.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이 러너는 Supabase·Qdrant를 쓰지 않는다 — env 스키마(필수 키·쌍 제약) 통과용 자리값.
// (run-extraction과 같은 자리값 정책 — 커밋된 .env에 숨어 기대지 않게 쌍으로 박는다.)
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { createEvalLlm, resolveEvalModelId } from "@server/eval/eval-llm";
import { createLimiter } from "@server/infra/llm/limiter";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { NARRATION_SYSTEM_PROMPT } from "@server/prompts/narration";
import type { Evidence } from "@server/services/assemble-evidence";
import { buildNarrationUserMessage } from "@server/services/narration";
import type { SearchedStatement } from "@server/services/statement-search";

import {
  NARRATION_FIXTURES,
  type NarrationFixture,
} from "./narration-marker-seed";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../.."));

/** 묶음당 반복 — 단발은 운(측정 #5·#7). run-extraction과 같은 5회로 맞춘다. */
const DEFAULT_RUNS_PER_FIXTURE = 5;
/** 스트리밍 동시 실행 수 — gpt-5 동시 4 초과 시 제공자 타임아웃(측정 #3). */
const NARRATION_CONCURRENCY = 4;
/** 지표 반올림 배율 — 소수 3자리 */
const ROUND_SCALE = 1000;
/** 프롬프트 지문 길이 — 결과가 어느 프롬프트로 잰 것인지 자기증명 */
const PROMPT_HASH_LENGTH = 8;
/** 마커: [s:<id>] 인라인 근거 (narration 규칙 2) */
const MARKER_PATTERN = /\[s:[^\]]+\]/;
/** 고정 타임스탬프 — 시드는 결정적이라 진짜 시각이 불필요 */
const FIXTURE_TIMESTAMP = "2026-01-01T00:00:00.000Z";

function round(value: number): number {
  return Math.round(value * ROUND_SCALE) / ROUND_SCALE;
}

const limitNarration = createLimiter(NARRATION_CONCURRENCY);

function parseRunsArg(): number {
  const flagIndex = process.argv.indexOf("--runs");
  if (flagIndex !== -1) {
    const parsed = Number(process.argv[flagIndex + 1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    console.error("--runs requires a positive integer");
    process.exit(1);
  }
  return DEFAULT_RUNS_PER_FIXTURE;
}

// 시드 명세 → 제품 Evidence. 진술을 한 source 묶음으로 싼다 — 흘림은 진술 수·관계 체인이
// 유발하지 묶음 분할이 아니라서. buildNarrationUserMessage가 제품과 동일한 입력 문자열을 만든다.
function toEvidence(fixture: NarrationFixture): Evidence {
  const statements: SearchedStatement[] = fixture.statements.map((s) => ({
    id: s.id,
    content: s.content,
    type: s.type,
    confidence: s.type === "claim" ? (s.confidence ?? "certain") : null,
    createdAt: FIXTURE_TIMESTAMP,
    score: 1,
    ...(s.supersededBy ? { supersededBy: s.supersededBy } : {}),
    ...(s.conflictsWith ? { conflictsWith: s.conflictsWith } : {}),
    ...(s.resolvedBy ? { resolvedBy: s.resolvedBy } : {}),
  }));
  return {
    groups: [
      {
        key: {
          kind: "source",
          sourceId: `src-${fixture.name}`,
          sourceCreatedAt: FIXTURE_TIMESTAMP,
        },
        totalStatementCount: statements.length,
        statements,
      },
    ],
    relatedStatements: (fixture.related ?? []).map((r) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      createdAt: FIXTURE_TIMESTAMP,
      sourceIds: [],
    })),
  };
}

async function narrate(llm: LlmProvider, message: string): Promise<string> {
  return limitNarration(async () => {
    let text = "";
    for await (const chunk of llm.generateStream({
      systemPrompt: NARRATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
    })) {
      text += chunk;
    }
    return text;
  });
}

// 종결부호(.?!…)+공백 또는 줄바꿈으로 가른다. 십진수(1.5)는 뒤에 공백이 없어 안 갈린다.
// "싼 조기경보"라 가벼운 기계 분리로 충분 — 정밀 분절은 과잉.
function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.?!…])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

interface RunOmission {
  total: number;
  missing: string[];
}

function measureOmission(text: string): RunOmission {
  const sentences = splitSentences(text);
  return {
    total: sentences.length,
    missing: sentences.filter((sentence) => !MARKER_PATTERN.test(sentence)),
  };
}

async function main() {
  const runsPerFixture = parseRunsArg();
  const llm = createEvalLlm();
  const started = Date.now();
  console.log(
    `묶음 ${NARRATION_FIXTURES.length}개 × ${runsPerFixture}회 해설 생성·채점 중 (모델 ${resolveEvalModelId()})...`,
  );

  interface FixtureRun {
    fixtureName: string;
    run: number;
    omission: RunOmission;
  }
  const runs: FixtureRun[] = [];
  const failed: Array<{ fixtureName: string; run: number; error: string }> = [];

  await Promise.all(
    NARRATION_FIXTURES.flatMap((fixture) => {
      const message = buildNarrationUserMessage(
        fixture.query,
        toEvidence(fixture),
      );
      return Array.from({ length: runsPerFixture }, (_, run) => async () => {
        try {
          const text = await narrate(llm, message);
          runs.push({
            fixtureName: fixture.name,
            run,
            omission: measureOmission(text),
          });
        } catch (error) {
          failed.push({
            fixtureName: fixture.name,
            run,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }).map((task) => task());
    }),
  );

  // 전 run 실패면 집계가 0/0으로 둔갑한다 — 가짜 성공 차단(run-extraction과 같은 가드)
  if (runs.length === 0) {
    console.error("all narration runs failed — no metrics to report:");
    for (const entry of failed) {
      console.error(`  - ${entry.fixtureName}#${entry.run}: ${entry.error}`);
    }
    process.exit(1);
  }

  // 묶음별 — 평균 누락률(run별 비율의 평균)
  const byFixture = NARRATION_FIXTURES.map((fixture) => {
    const fixtureRuns = runs.filter((r) => r.fixtureName === fixture.name);
    const rates = fixtureRuns.map((r) =>
      r.omission.total === 0 ? 0 : r.omission.missing.length / r.omission.total,
    );
    const meanRate =
      rates.length === 0
        ? null
        : rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    return {
      fixture: fixture.name,
      runs: fixtureRuns.length,
      meanOmissionRate: meanRate === null ? null : round(meanRate),
    };
  });

  // 전체 — micro(전 run·전 문장 합산). 묶음별 문장 수가 달라도 한 문장 = 한 표.
  const totalSentences = runs.reduce((sum, r) => sum + r.omission.total, 0);
  const totalMissing = runs.reduce(
    (sum, r) => sum + r.omission.missing.length,
    0,
  );
  const overallRate =
    totalSentences === 0 ? 0 : round(totalMissing / totalSentences);

  // 실패 사례 전수(결정 #7 결) — 마커 없는 문장 원문을 남겨 사람이 진짜 누락/분절 오류를 가린다.
  const flagged = runs.flatMap((r) =>
    r.omission.missing.map((sentence) => ({
      fixture: r.fixtureName,
      run: r.run,
      sentence,
    })),
  );

  const summary = {
    fixtures: NARRATION_FIXTURES.length,
    runsPerFixture,
    evaluatedRuns: runs.length,
    failedRuns: failed.length,
    overallOmissionRate: overallRate,
    totalSentences,
    totalMissing,
    byFixture,
  };

  const promptHash = createHash("sha1")
    .update(NARRATION_SYSTEM_PROMPT)
    .digest("hex")
    .slice(0, PROMPT_HASH_LENGTH);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-narration-markers-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        model: resolveEvalModelId(),
        promptHash,
        runsPerFixture,
        failedRuns: failed,
        summary,
        flaggedSentences: flagged,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n=== 요약 (prompt ${promptHash}, ${Math.round((Date.now() - started) / 1000)}s) ===`,
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("narration marker run failed:", error);
  process.exit(1);
});
