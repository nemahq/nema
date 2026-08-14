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
  formatDigestFieldValue,
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
import type { DedupResult } from "@server/services/digest-dedup-service";
import { dropContainedDigests } from "@server/services/digest-dedup-service";

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

// 걸러내기(dropContainedDigests)에 넘길 수 있게 5개 배열을 평평한 목록으로 편다.
// body는 프로덕션의 flattenGeneratedDigests와 같은 기준으로 빈 칸을 뺀 나머지다 —
// 걸러내기가 보는 입력이 프로덕션과 달라지면 여기서 잰 결과가 실제와 어긋난다.
// reasoning은 eval 전용이라 body에 안 넣고 항목에 얹어 따라가게만 한다.
interface ReasoningItem {
  type: DigestType;
  title: string;
  body: Record<string, unknown>;
  reasoning: string;
}

function toReasoningItems(
  generated: ReasoningGeneratedDigests,
): ReasoningItem[] {
  const items: ReasoningItem[] = [];

  const entries = Object.entries(ARRAY_TYPE) as Array<
    [keyof typeof ARRAY_TYPE, DigestType]
  >;
  for (const [arrayKey, digestType] of entries) {
    for (const digestItem of generated[arrayKey]) {
      const { title, reasoning, ...rest } = digestItem;
      items.push({
        type: digestType,
        title,
        reasoning,
        body: Object.fromEntries(
          Object.entries(rest).filter(([, value]) => !isBlank(value)),
        ),
      });
    }
  }

  return items;
}

function formatBodyLines(item: ReasoningItem): string[] {
  const lines: string[] = [];
  for (const { key, label } of DIGEST_BODY_FIELD_ORDER[item.type]) {
    const fieldValue = item.body[key];
    if (fieldValue === undefined) {
      continue;
    }
    lines.push(`- **${label}**: ${formatDigestFieldValue(fieldValue)}`);
  }
  return lines;
}

function formatItem(item: ReasoningItem): string {
  const lines = [
    `## [${DIGEST_TYPE_LABEL[item.type]}] ${item.title}`,
    "",
    ...formatBodyLines(item),
  ];
  // blockquote로 뺀다 — 다이제스트 필드(`- **라벨**:`)와 섞이면 실제로 저장될
  // 내용처럼 보인다. reasoning은 eval에서만 보는 부가 정보라 구분돼야 한다.
  lines.push("", `> **${REASONING_FIELD_LABEL}**: ${item.reasoning}`);
  return lines.join("\n");
}

// 뺀 카드는 본문까지 싣는다. 제목과 판정 이유만으로는 "이게 정말 겹쳤나"를 못 가리고,
// 결국 원문을 다시 열어 대조하게 된다 — 그러면 이 목록이 검증을 싸게 만든다는 값어치를
// 잃는다. 무엇을 잃었는지가 목록 안에서 그대로 보여야 한다.
function formatDropped(entry: DedupResult<ReasoningItem>["dropped"][number]) {
  const { digest, containedIn, field, reason } = entry;
  const containerField = DIGEST_BODY_FIELD_ORDER[containedIn.type].find(
    (spec) => spec.key === field,
  );
  const containerValue = containedIn.body[field];

  return [
    `### [${DIGEST_TYPE_LABEL[digest.type]}] ${digest.title}`,
    "",
    ...formatBodyLines(digest),
    "",
    `> **담고 있다는 쪽**: [${DIGEST_TYPE_LABEL[containedIn.type]}] ${containedIn.title}`,
    `> **그쪽 \`${field}\`(${containerField?.label ?? "칸 없음"})**: ${containerValue === undefined ? "— 그 칸이 비어 있다(판정이 없는 칸을 짚었다)" : formatDigestFieldValue(containerValue)}`,
    `> **판정 이유**: ${reason}`,
  ].join("\n");
}

function formatResponse(args: {
  stem: string;
  omitted: ReasoningGeneratedDigests["omitted"];
  result: DedupResult<ReasoningItem>;
}): string {
  const { stem, omitted, result } = args;

  // 뺀 것을 결과 파일에 함께 남긴다 — 이게 없으면 빠짐을 찾으려 before/after diff를
  // 통째로 읽어야 하는데, 목록이 있으면 각 줄이 정당한지만 보면 된다.
  const droppedSection = [
    `## 겹쳐서 뺀 다이제스트 (${result.dropped.length}개)`,
    ...result.dropped.map(formatDropped),
  ].join("\n\n");

  const omittedSection = [
    `## 제외된 판단 (${omitted.length}개)`,
    "",
    ...omitted.map((entry) => `- "${entry.note}" — ${entry.reason}`),
  ].join("\n");

  return [
    `# ${stem} (reasoning)`,
    `digest count: ${result.kept.length}`,
    ...result.kept.map(formatItem),
    droppedSection,
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

    const result = await dropContainedDigests(toReasoningItems(generated));

    const stem = basename(file, ".md");
    const outPath = join(resultsDir, `${stem}.reasoning.md`);
    writeFileSync(
      outPath,
      formatResponse({ stem, omitted: generated.omitted, result }),
    );

    console.log(
      `[OK] ${file}: ${result.kept.length} digests, ${result.dropped.length} dropped, ${generated.omitted.length} omitted -> ${basename(outPath)}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
