// 추출 일관성 러너 (실데이터·고품질 맥락) — NEM-168 태스크 7.
//
// 실행: apps/server에서
//   TIRO_DIR=/abs/path/to/.local/tiro-samples pnpm tsx src/eval/statement-engine/run-extraction-consistency.ts
// 필요 키: 측정 모델 키(EVAL_LLM_MODEL), ANTHROPIC_API_KEY(심판).
//
// 왜: 골든 시험지는 작고 합성이라 일관성 0.906이 부풀 수 있다(측정 #8·#10). tiro 실데이터를
//   제품 경로(generateDraft, v1 폴리시)로 정제한 고품질 노트에서 추출 일관성을 다시 잰다 —
//   태스크 1이 짚은 모델 약점(쪼개기 경계 불안정)을 실데이터에서 직격.
// 흐름: tiro transcript → generateDraft(고품질 맥락, 태스크 6 결정) → 추출 5회 → 쌍대 F1.
// 골든 불필요 — 일관성은 자기참조(같은 입력 N회의 표현·경계 흔들림). 진술 수 분산을 동반 신호로 본다.
// 결과는 results-extraction-consistency-*.json (gitignore, 재실행으로 재생성).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이 러너는 Supabase·Qdrant를 쓰지 않는다 — env 스키마 통과용 자리값(run-extraction과 동일).
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { createEvalLlm, resolveEvalModelId } from "@server/eval/eval-llm";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  buildFirstCallMessage,
  DRAFTING_SYSTEM_PROMPT,
} from "@server/prompts/drafting";

import {
  computePairwiseConsistency,
  extract,
  type NormalizedStatement,
} from "./extraction-core";
import { createJudge } from "./judge";
import { round } from "./metrics";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const RUNS_PER_NOTE = 5;
// judge(Claude) 동시성이 벽시계의 병목 — 호출이 작아 동시성이 곧 처리량이다.
// callWithRetry가 429/529를 백오프 재시도하므로 올려도 안전. JUDGE_CONCURRENCY로 조절.
const DEFAULT_JUDGE_CONCURRENCY = 16;
const JUDGE_CONCURRENCY =
  Number(process.env["JUDGE_CONCURRENCY"]) || DEFAULT_JUDGE_CONCURRENCY;
// generateDraft 입력 상한 — 표본은 ~14k자라 여유로우나, 코퍼스 교체 시 폭주 방지.
const TRANSCRIPT_CHAR_CAP = 40_000;

// 노트 타입 다양성(회의·인터뷰·싱크·아이데이션)으로 고정 — 재현 위해 무작위 대신 명시.
// draftingPairPool(curation.json)에서 골랐다.
const SAMPLE_NOTE_IDS = [
  "2025-12-29-상담-처리시간-통계-설계-회의-w커티스-리버-에디-마루-션-ScFH48jmhqxwv",
  "2025-12-30-태스크-관련-사용성-인터뷰-베이지-캐롤-bwbKCVqe8MNk5",
  "2025-12-31-커스텀-리포트-관련-인터뷰_크몽-w커티스-fFykNLNN9retH",
  "2026-01-06-feat-OX-정규-싱크-eFENRmr5nU3ux",
  "2026-01-07-커스텀리포트-알리기-액션-아이데이션w커티스-션-엠케이-AiDdeWN7KUEkL",
];

// 긴 전사 정제는 추출보다 무겁다 — 기본 타임아웃은 큰 노트에서 끊긴다(측정 #11 실패 사례).
const DRAFT_TIMEOUT_MS = 180_000;
const DRAFT_MAX_ATTEMPTS = 3;
const DRAFT_RETRY_DELAY_MS = 3_000;

async function generateDraft(
  llm: LlmProvider,
  transcript: string,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < DRAFT_MAX_ATTEMPTS; attempt += 1) {
    try {
      let text = "";
      for await (const chunk of llm.generateStream({
        systemPrompt: DRAFTING_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildFirstCallMessage(transcript) },
        ],
        timeoutMs: DRAFT_TIMEOUT_MS,
      })) {
        text += chunk;
      }
      return text.trim();
    } catch (error) {
      lastError = error;
      console.warn(
        `  draft 재시도 ${attempt + 1}/${DRAFT_MAX_ATTEMPTS}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, DRAFT_RETRY_DELAY_MS * (attempt + 1)),
      );
    }
  }
  throw lastError;
}

interface CountStats {
  counts: number[];
  min: number;
  max: number;
  mean: number;
  // (max-min)/mean — 진술 수가 run마다 얼마나 흔들리나(쪼개기 경계 불안정의 무료 신호)
  dispersion: number;
}

function countStats(runs: NormalizedStatement[][]): CountStats {
  const counts = runs.map((run) => run.length);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const mean = counts.reduce((sum, value) => sum + value, 0) / counts.length;
  return {
    counts,
    min,
    max,
    mean: round(mean),
    dispersion: mean === 0 ? 0 : round((max - min) / mean),
  };
}

interface NoteReport {
  noteId: string;
  transcriptChars: number;
  draftChars: number;
  draftedBody: string;
  consistencyMean: number | null;
  pairwiseF1: number[];
  countStats: CountStats;
}

async function evaluateNote(params: {
  llm: LlmProvider;
  judge: ReturnType<typeof createJudge>;
  tiroDir: string;
  noteId: string;
}): Promise<NoteReport> {
  const { llm, judge, tiroDir, noteId } = params;
  const transcript = readFileSync(
    resolve(tiroDir, "notes", noteId, "transcript.txt"),
    "utf8",
  )
    .slice(0, TRANSCRIPT_CHAR_CAP)
    .trim();

  const draftedBody = await generateDraft(llm, transcript);
  const runs = await Promise.all(
    Array.from({ length: RUNS_PER_NOTE }, () => extract(llm, draftedBody)),
  );
  const consistency = await computePairwiseConsistency(runs, judge);

  return {
    noteId,
    transcriptChars: transcript.length,
    draftChars: draftedBody.length,
    draftedBody,
    consistencyMean: consistency.mean,
    pairwiseF1: consistency.pairwiseF1,
    countStats: countStats(runs),
  };
}

async function main() {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"]?.trim();
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is required (judge is Claude-locked)");
    process.exit(1);
  }
  const tiroEnv = process.env["TIRO_DIR"]?.trim();
  const tiroDir = tiroEnv
    ? resolve(tiroEnv)
    : resolve(__dirname, "../../../../../.local/tiro-samples");
  // NOTE_IDS(쉼표 구분)로 표본을 좁힌다 — 일시 실패한 노트만 재실행할 때 쓴다.
  const noteIdsEnv = process.env["NOTE_IDS"]?.trim();
  const noteIds = noteIdsEnv
    ? noteIdsEnv
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : SAMPLE_NOTE_IDS;
  for (const noteId of noteIds) {
    if (!existsSync(resolve(tiroDir, "notes", noteId, "transcript.txt"))) {
      console.error(`tiro 노트 없음: ${noteId} (${tiroDir})`);
      process.exit(1);
    }
  }

  const llm = createEvalLlm();
  const judge = createJudge(anthropicKey, JUDGE_CONCURRENCY);

  const started = Date.now();
  console.log(
    `노트 ${noteIds.length}개 × draft + ${RUNS_PER_NOTE}회 추출 + 일관성 채점 (모델 ${resolveEvalModelId()})...`,
  );

  // 노트 단위로 오류 격리 — 한 노트 실패가 나머지의 (비용 지불된) 결과를 유실시키지 않게.
  const reports: NoteReport[] = [];
  const failedNotes: Array<{ noteId: string; error: string }> = [];
  await Promise.all(
    noteIds.map(async (noteId) => {
      try {
        const report = await evaluateNote({ llm, judge, tiroDir, noteId });
        reports.push(report);
        console.log(
          `  ✓ [${noteId}] 일관성 ${report.consistencyMean} · 진술 ${report.countStats.counts.join("/")} · ${Math.round((Date.now() - started) / 1000)}s`,
        );
      } catch (error) {
        failedNotes.push({
          noteId,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(
          `  ✗ [${noteId}] ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  if (reports.length === 0) {
    console.error("all notes failed — no metrics to report:");
    for (const failed of failedNotes) {
      console.error(`  - ${failed.noteId}: ${failed.error}`);
    }
    process.exit(1);
  }

  const consistencies = reports.flatMap((report) =>
    report.consistencyMean === null ? [] : [report.consistencyMean],
  );
  const consistencyMean =
    consistencies.length === 0
      ? null
      : round(
          consistencies.reduce((sum, value) => sum + value, 0) /
            consistencies.length,
        );
  const dispersionMean = round(
    reports.reduce((sum, report) => sum + report.countStats.dispersion, 0) /
      reports.length,
  );

  const summary = {
    notes: { total: noteIds.length, evaluated: reports.length },
    consistencyMean,
    dispersionMean,
    perNote: reports.map((report) => ({
      noteId: report.noteId,
      consistencyMean: report.consistencyMean,
      counts: report.countStats.counts,
      dispersion: report.countStats.dispersion,
    })),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-extraction-consistency-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        model: resolveEvalModelId(),
        runsPerNote: RUNS_PER_NOTE,
        judgeUsage: judge.usage(),
        failedNotes,
        summary,
        notes: reports,
      },
      null,
      2,
    ),
  );

  console.log("\n=== 요약 ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("eval run failed:", error);
  process.exit(1);
});
