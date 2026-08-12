// samples/*.md를 LLM에 직접 넣어(DB 저장 없이) 다이제스트 + 판단 이유를 뽑아
// human-review/results/에 남긴다. run.ts와 달리 API를 안 거친다 — reasoning
// 스키마는 eval 전용이라 프로덕션 source.ingest가 반환하는 모양이 아니다.
//
// usage: npx tsx run-with-reasoning.ts [파일명...]
//   인자 없으면 samples/ 전체를 돈다.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DigestType } from "@nema-io/shared";

import { loadEnv } from "@server/env";
import {
  DIGEST_BODY_FIELD_ORDER,
  DIGEST_TYPE_LABEL,
  REASONING_FIELD_LABEL,
} from "@server/eval/digest-engine/format";
import type { ReasoningGeneratedDigests } from "@server/eval/digest-engine/reasoning-schema";
import {
  buildReasoningSystemPrompt,
  ReasoningDigestGenerationSchema,
} from "@server/eval/digest-engine/reasoning-schema";
import { getDigestGenerationProvider } from "@server/infra/llm/provider";
import { resolveModelId } from "@server/infra/llm/task-routing";
import { buildDigestGenerationMessage } from "@server/prompts/digest-generation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, "..", "..", "samples");
// 모델별로 나눠 담지 않으면 다음 모델 실행이 직전 결과를 덮어써 대조가 불가능해진다.
const RESULTS_ROOT = join(__dirname, "..", "results");
const SERVER_ROOT = join(__dirname, "..", "..", "..", "..", "..");

const ARRAY_TYPE = {
  decisions: "decision",
  pendings: "pending",
  learnings: "learning",
  ideas: "idea",
  assumptions: "assumption",
} as const satisfies Record<
  Exclude<keyof ReasoningGeneratedDigests, "omitted">,
  DigestType
>;

// production 경로(digest-generation.ts의 isEmpty)와 같은 기준 — reasoning
// 실행기는 flattenGeneratedDigests를 안 거치고 원본 LLM 응답을 그대로 찍어서,
// 빈 문자열/빈 배열을 직접 걸러야 한다.
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function formatItem(
  digestType: DigestType,
  digestItem: Record<string, unknown>,
): string {
  const { title, reasoning, ...rest } = digestItem;
  const lines = [`## [${DIGEST_TYPE_LABEL[digestType]}] ${String(title)}`, ""];
  for (const { key, label } of DIGEST_BODY_FIELD_ORDER[digestType]) {
    const fieldValue = rest[key];
    if (isBlank(fieldValue)) {
      continue;
    }
    const formatted = Array.isArray(fieldValue)
      ? `\n${fieldValue.map((entry) => `  - ${entry}`).join("\n")}`
      : String(fieldValue);
    lines.push(`- **${label}**: ${formatted}`);
  }
  // blockquote로 뺀다 — 다이제스트 필드(`- **라벨**:`)와 섞이면 실제로 저장될
  // 내용처럼 보인다. reasoning은 eval에서만 보는 부가 정보라 구분돼야 한다.
  lines.push("", `> **${REASONING_FIELD_LABEL}**: ${String(reasoning)}`);
  return lines.join("\n");
}

function formatResponse(
  stem: string,
  generated: ReasoningGeneratedDigests,
): string {
  const sections: string[] = [];
  let count = 0;

  const entries = Object.entries(ARRAY_TYPE) as Array<
    [keyof typeof ARRAY_TYPE, DigestType]
  >;
  for (const [arrayKey, digestType] of entries) {
    for (const digestItem of generated[arrayKey]) {
      count += 1;
      sections.push(formatItem(digestType, digestItem));
    }
  }

  const omittedSection = [
    `## 제외된 판단 (${generated.omitted.length}개)`,
    "",
    ...generated.omitted.map((entry) => `- "${entry.note}" — ${entry.reason}`),
  ].join("\n");

  return [
    `# ${stem} (reasoning)`,
    `digest count: ${count}`,
    ...sections,
    omittedSection,
  ].join("\n\n");
}

async function main() {
  loadEnv(SERVER_ROOT);

  const requested = process.argv.slice(2);
  const allFiles = readdirSync(SAMPLES_DIR).filter((f) => f.endsWith(".md"));
  const files = requested.length > 0 ? requested : allFiles;

  const provider = getDigestGenerationProvider();
  const resultsDir = join(RESULTS_ROOT, resolveModelId("generateDigests"));
  mkdirSync(resultsDir, { recursive: true });

  for (const file of files) {
    const body = readFileSync(join(SAMPLES_DIR, file), "utf-8");
    const generated = await provider.generateStructured({
      systemPrompt: buildReasoningSystemPrompt(),
      messages: [{ role: "user", content: buildDigestGenerationMessage(body) }],
      schema: ReasoningDigestGenerationSchema,
    });

    const stem = basename(file, ".md");
    const outPath = join(resultsDir, `${stem}.reasoning.md`);
    writeFileSync(outPath, formatResponse(stem, generated));

    const count = Object.entries(ARRAY_TYPE).reduce(
      (sum, [arrayKey]) =>
        sum + generated[arrayKey as keyof typeof ARRAY_TYPE].length,
      0,
    );
    console.log(
      `[OK] ${file}: ${count} digests, ${generated.omitted.length} omitted -> ${basename(outPath)}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
