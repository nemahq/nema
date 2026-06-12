import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "tsup";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

// 커밋 SHA 우선순위: RAILWAY_GIT_COMMIT_SHA(repo 연동 배포로 되돌아갈 경우 대비)
// → CI가 railway up 직전 저장소 루트에 스탬프한 .commit-sha 파일.
// Railway 빌더(RAILWAY_PROJECT_ID 존재)에서 유효한 SHA를 못 찾으면 조용히 dev로
// 배포되는 대신 빌드를 실패시킨다. 로컬 빌드는 파일을 읽지 않고 항상 dev.
function resolveCommitSha(): string {
  const fromEnv = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (fromEnv && COMMIT_SHA_PATTERN.test(fromEnv)) {
    return fromEnv;
  }
  if (!process.env.RAILWAY_PROJECT_ID) {
    return "dev";
  }
  const stampFile = resolve(__dirname, "../../.commit-sha");
  if (!existsSync(stampFile)) {
    throw new Error(
      "Missing .commit-sha stamp in Railway build — CI must write it before railway up",
    );
  }
  const sha = readFileSync(stampFile, "utf8").trim();
  if (!COMMIT_SHA_PATTERN.test(sha)) {
    throw new Error(`Invalid commit SHA in .commit-sha stamp: "${sha}"`);
  }
  return sha;
}

export default defineConfig({
  entry: ["src/index.ts", "src/instrument.ts"],
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  noExternal: ["@nema-io/shared"],
  splitting: false,
  sourcemap: true,
  define: {
    __COMMIT_SHA__: JSON.stringify(resolveCommitSha()),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
});
