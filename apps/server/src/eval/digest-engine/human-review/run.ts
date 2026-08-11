// samples/*.md를 staging source.ingest에 넣고, 응답을 사람이 읽기 좋은 구조화
// 텍스트로 human-review/에 남긴다. 값은 옮겨 적을 뿐 고치지 않는다 — 순수 실행+포맷.
//
// usage: STAGING_PASSWORD=... npx tsx run.ts [파일명...]
//   인자 없으면 samples/ 전체를 돈다.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Digest, DigestType } from "@nema-io/shared";

import {
  DIGEST_BODY_FIELD_ORDER,
  DIGEST_TYPE_LABEL,
} from "@server/eval/digest-engine/format";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, "..", "samples");
const RESULTS_DIR = __dirname;

// 배포가 죽어있을 때 로컬에서 staging DB/LLM에 붙여 확인할 수 있게 오버라이드를 둔다.
const STAGING_URL = process.env["API_URL"] ?? "https://api-staging.getnema.app";
const STAGING_SUPABASE_URL = "https://iydatypmzqconlcqljbj.supabase.co";
// publishable 키 — 비밀 아님(apps/server/.env.staging과 동일).
const STAGING_ANON_KEY = "sb_publishable_THSE5qolsyQJRnMA6NCJeg_dxHdM0s_";
const DOGFOOD_EMAIL = "claude@getnema.app";

interface IngestResponse {
  result?: { data: { sourceId: string; digests: Digest[] } };
  error?: { message: string };
}

async function getToken(password: string): Promise<string> {
  const res = await fetch(
    `${STAGING_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: STAGING_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: DOGFOOD_EMAIL, password }),
    },
  );
  const tokenResponse = (await res.json()) as { access_token?: string };
  if (!tokenResponse.access_token) {
    throw new Error(`토큰 발급 실패: ${JSON.stringify(tokenResponse)}`);
  }
  return tokenResponse.access_token;
}

async function ingest(token: string, body: string): Promise<IngestResponse> {
  const res = await fetch(`${STAGING_URL}/trpc/source.ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  return (await res.json()) as IngestResponse;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `\n${value.map((item) => `  - ${item}`).join("\n")}`;
  }
  return String(value);
}

function formatDigest(index: number, digest: Digest): string {
  const type = digest.type as DigestType;
  const lines = [
    `## ${index}. [${DIGEST_TYPE_LABEL[type]}] ${digest.title}`,
    "",
  ];
  const body = digest.body as Record<string, unknown>;
  for (const { key, label } of DIGEST_BODY_FIELD_ORDER[type]) {
    if (key in body) {
      lines.push(`- **${label}**: ${formatValue(body[key])}`);
    }
  }
  return lines.join("\n");
}

function formatResponse(
  stem: string,
  data: { sourceId: string; digests: Digest[] },
): string {
  const parts = [
    `# ${stem}`,
    "",
    `source_id: \`${data.sourceId}\`  `,
    `digest count: ${data.digests.length}`,
    "",
  ];
  data.digests.forEach((digest, i) => {
    parts.push(formatDigest(i + 1, digest), "");
  });
  return parts.join("\n");
}

async function main() {
  const password = process.env["STAGING_PASSWORD"];
  if (!password) {
    throw new Error("STAGING_PASSWORD 환경변수가 필요합니다.");
  }

  const requested = process.argv.slice(2);
  const allFiles = readdirSync(SAMPLES_DIR).filter((f) => f.endsWith(".md"));
  const files = requested.length > 0 ? requested : allFiles;

  const token = await getToken(password);

  for (const file of files) {
    const path = join(SAMPLES_DIR, file);
    const body = readFileSync(path, "utf-8");
    const result = await ingest(token, body);

    if (result.error) {
      console.log(`[FAIL] ${file}: ${result.error.message}`);
      continue;
    }
    if (!result.result) {
      console.log(`[FAIL] ${file}: 응답 형식 예상과 다름`);
      continue;
    }

    const stem = basename(file, ".md");
    const formatted = formatResponse(stem, result.result.data);
    const outPath = join(RESULTS_DIR, `${stem}.md`);
    writeFileSync(outPath, formatted);
    console.log(
      `[OK] ${file}: ${result.result.data.digests.length} digests -> ${basename(outPath)}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
