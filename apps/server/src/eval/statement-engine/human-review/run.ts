// digest-engine/human-review/results/*.reasoning.md를 파싱해 다이제스트를 mock으로
// 복원하고, 진술 생성 프롬프트만 직접 LLM에 넣는다(DB·tRPC 다 안 거침 — run-with-reasoning.ts와
// 같은 이유). 다이제스트를 매번 새로 뽑지 않고 이미 리뷰된 실물을 그대로 쓰므로, 다이제스트
// 생성의 비결정성이 진술 품질 관찰에 안 섞인다.
//
// usage: npx tsx run.ts [파일명...]
//   인자 없으면 digest-engine/human-review/results/ 전체를 돈다.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Digest, DigestType } from "@nema-io/shared";

import { loadEnv } from "@server/env";
import {
  DIGEST_BODY_FIELD_ORDER,
  DIGEST_TYPE_LABEL,
} from "@server/eval/digest-engine/format";
import { getStatementGenerationProvider } from "@server/infra/llm/provider";
import {
  buildStatementGenerationMessage,
  buildStatementGenerationSystemPrompt,
  StatementGenerationSchema,
} from "@server/prompts/statement-generation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIGEST_RESULTS_DIR = join(
  __dirname,
  "..",
  "..",
  "digest-engine",
  "human-review",
  "results",
);
const RESULTS_DIR = join(__dirname, "results");
const SERVER_ROOT = join(__dirname, "..", "..", "..", "..");

type MockDigest = Pick<Digest, "type" | "title" | "body">;

const TYPE_BY_LABEL = Object.fromEntries(
  Object.entries(DIGEST_TYPE_LABEL).map(([type, label]) => [label, type]),
) as Record<string, DigestType>;

const FIELD_KEY_BY_LABEL: Record<
  DigestType,
  Record<string, string>
> = Object.fromEntries(
  (
    Object.entries(DIGEST_BODY_FIELD_ORDER) as Array<
      [DigestType, Array<{ key: string; label: string }>]
    >
  ).map(([type, specs]) => [
    type,
    Object.fromEntries(specs.map((spec) => [spec.label, spec.key])),
  ]),
) as Record<DigestType, Record<string, string>>;

// results/*.reasoning.md는 "## [라벨] 제목" 다이제스트 블록 여러 개 + 맨 끝
// "## 제외된 판단" 섹션으로 이뤄진다(run-with-reasoning.ts의 formatResponse가 쓰는 모양).
// reasoning(`> **판단 이유**: ...`)은 eval 전용 칸이라 안 읽는다 — 진술 생성 프롬프트는
// 프로덕션과 똑같이 title+body만 받아야 실제 경로와 같은 조건이 된다.
function parseDigestResults(content: string): MockDigest[] {
  const digests: MockDigest[] = [];
  let current: MockDigest | null = null;
  let pendingArrayKey: string | null = null;
  let pendingArrayItems: string[] = [];

  const flushArray = () => {
    if (current && pendingArrayKey && pendingArrayItems.length > 0) {
      (current.body as Record<string, unknown>)[pendingArrayKey] = [
        ...pendingArrayItems,
      ];
    }
    pendingArrayKey = null;
    pendingArrayItems = [];
  };
  const flushDigest = () => {
    flushArray();
    if (current) {
      digests.push(current);
    }
    current = null;
  };

  for (const line of content.split("\n")) {
    if (line.startsWith("## 제외된 판단")) {
      flushDigest();
      break;
    }

    const heading = /^## \[(.+?)\] (.+)$/.exec(line);
    if (heading) {
      flushDigest();
      const [, label, title] = heading;
      const type = TYPE_BY_LABEL[label];
      if (!type) {
        throw new Error(`알 수 없는 다이제스트 유형 라벨: ${label}`);
      }
      current = { type, title, body: {} };
      continue;
    }
    if (!current) {
      continue;
    }

    const field = /^- \*\*(.+?)\*\*: (.*)$/.exec(line);
    if (field) {
      flushArray();
      const [, label, inline] = field;
      const key = FIELD_KEY_BY_LABEL[current.type][label];
      if (!key) {
        continue;
      }
      if (inline.trim().length > 0) {
        (current.body as Record<string, unknown>)[key] = inline.trim();
      } else {
        pendingArrayKey = key;
        pendingArrayItems = [];
      }
      continue;
    }

    const arrayItem = /^ {2}- (.*)$/.exec(line);
    if (arrayItem && pendingArrayKey) {
      pendingArrayItems.push(arrayItem[1].trim());
      continue;
    }

    if (line.startsWith(">")) {
      flushArray();
    }
  }
  flushDigest();
  return digests;
}

function formatResult(args: {
  index: number;
  digest: MockDigest;
  statement: string;
}): string {
  const { index, digest, statement } = args;
  const lines = [
    `## ${index}. [${DIGEST_TYPE_LABEL[digest.type as DigestType]}] ${digest.title}`,
    "",
  ];
  const body = digest.body as Record<string, unknown>;
  for (const { key, label } of DIGEST_BODY_FIELD_ORDER[
    digest.type as DigestType
  ]) {
    if (key in body) {
      const fieldValue = body[key];
      const formatted = Array.isArray(fieldValue)
        ? `\n${fieldValue.map((item) => `  - ${item}`).join("\n")}`
        : String(fieldValue);
      lines.push(`- **${label}**: ${formatted}`);
    }
  }
  lines.push("", `**statement**: ${statement}`);
  return lines.join("\n");
}

async function generateStatement(digest: MockDigest): Promise<string> {
  const result = await getStatementGenerationProvider().generateStructured({
    systemPrompt: buildStatementGenerationSystemPrompt(),
    messages: [
      { role: "user", content: buildStatementGenerationMessage(digest) },
    ],
    schema: StatementGenerationSchema,
  });
  return result.statement;
}

async function main() {
  loadEnv(SERVER_ROOT);

  const requested = process.argv.slice(2);
  const allFiles = readdirSync(DIGEST_RESULTS_DIR).filter((f) =>
    f.endsWith(".reasoning.md"),
  );
  const files = requested.length > 0 ? requested : allFiles;

  for (const file of files) {
    const content = readFileSync(join(DIGEST_RESULTS_DIR, file), "utf-8");
    const digests = parseDigestResults(content);
    if (digests.length === 0) {
      console.log(`[SKIP] ${file}: 파싱된 다이제스트 없음`);
      continue;
    }

    const results = await Promise.all(
      digests.map(async (digest) => {
        try {
          return { digest, statement: await generateStatement(digest) };
        } catch (error) {
          return {
            digest,
            statement: `[ERROR] ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }),
    );

    const stem = basename(file, ".reasoning.md");
    const withStatement = results.filter(
      (r) => !r.statement.startsWith("[ERROR]"),
    ).length;
    const formatted = [
      `# ${stem} (statements)`,
      "",
      `digest count: ${digests.length}  `,
      `statement count: ${withStatement}/${digests.length}`,
      "",
      ...results.map((r, i) =>
        formatResult({
          index: i + 1,
          digest: r.digest,
          statement: r.statement,
        }),
      ),
    ].join("\n\n");

    writeFileSync(join(RESULTS_DIR, `${stem}.statements.md`), formatted);
    console.log(
      `[OK] ${file}: ${withStatement}/${digests.length} statements -> ${stem}.statements.md`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
