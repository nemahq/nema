// samples/*.md를 LLM에 직접 넣어(DB 저장 없이) 다이제스트 + 판단 이유를 뽑는다.
// run.ts와 달리 API를 안 거친다 — reasoning 스키마는 eval 전용이라 프로덕션
// source.ingest가 반환하는 모양이 아니다.
//
// usage: npx tsx run-with-reasoning.ts [파일명...]
//   인자 없으면 samples/ 전체를 돈다.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "@server/env";
import type { ReasoningGeneratedDigests } from "@server/eval/digest-engine/reasoning-schema";
import {
  buildReasoningSystemPrompt,
  ReasoningDigestGenerationSchema,
} from "@server/eval/digest-engine/reasoning-schema";
import { getDigestGenerationProvider } from "@server/infra/llm/provider";
import { buildDigestGenerationMessage } from "@server/prompts/digest-generation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, "..", "samples");
const RESULTS_DIR = __dirname;
const SERVER_ROOT = join(__dirname, "..", "..", "..", "..");

const ARRAY_LABELS = {
  decisions: "decision",
  pendings: "pending",
  learnings: "learning",
  ideas: "idea",
  assumptions: "assumption",
} as const satisfies Record<
  Exclude<keyof ReasoningGeneratedDigests, "omitted">,
  string
>;

function formatItem(
  digestType: string,
  digestItem: Record<string, unknown>,
): string {
  const { title, reasoning, ...rest } = digestItem;
  const lines = [`## [${digestType}] ${String(title)}`, ""];
  for (const [key, value] of Object.entries(rest)) {
    if (value === null) {
      continue;
    }
    const formatted = Array.isArray(value)
      ? `\n${value.map((entry) => `  - ${entry}`).join("\n")}`
      : String(value);
    lines.push(`- **${key}**: ${formatted}`);
  }
  lines.push(`- **reasoning**: ${String(reasoning)}`);
  return lines.join("\n");
}

function formatResponse(
  stem: string,
  generated: ReasoningGeneratedDigests,
): string {
  const sections: string[] = [];
  let count = 0;

  const entries = Object.entries(ARRAY_LABELS) as Array<
    [keyof typeof ARRAY_LABELS, string]
  >;
  for (const [arrayKey, digestType] of entries) {
    for (const digestItem of generated[arrayKey]) {
      count += 1;
      sections.push(formatItem(digestType, digestItem));
    }
  }

  const omittedSection = [
    `## Omitted (${generated.omitted.length})`,
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

  for (const file of files) {
    const body = readFileSync(join(SAMPLES_DIR, file), "utf-8");
    const generated = await provider.generateStructured({
      systemPrompt: buildReasoningSystemPrompt(),
      messages: [{ role: "user", content: buildDigestGenerationMessage(body) }],
      schema: ReasoningDigestGenerationSchema,
    });

    const stem = basename(file, ".md");
    const outPath = join(RESULTS_DIR, `${stem}.reasoning.md`);
    writeFileSync(outPath, formatResponse(stem, generated));

    const count = Object.entries(ARRAY_LABELS).reduce(
      (sum, [arrayKey]) =>
        sum + generated[arrayKey as keyof typeof ARRAY_LABELS].length,
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
