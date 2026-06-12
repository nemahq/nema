import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "tsup";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

// 커밋 SHA 우선순위: RAILWAY_GIT_COMMIT_SHA(repo 연동 배포로 되돌아갈 경우 대비)
// → CI가 railway up 직전 저장소 루트에 스탬프한 .commit-sha 파일.
// Railway 빌드 감지(RAILWAY_PROJECT_ID)는 Railpack 빌드 환경에 그 변수가 없어
// 동작하지 않았다(NEM-135) — 파일 존재 자체를 신호로 쓰고, "배포가 조용히 dev로
// 회귀" 가드는 부팅 시 런타임 검사로 옮겼다(index.ts). 로컬 빌드는 항상 dev.
function resolveCommitSha(): string {
  const fromEnv = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (fromEnv && COMMIT_SHA_PATTERN.test(fromEnv)) {
    return fromEnv;
  }
  const stampFile = resolve(__dirname, "../../.commit-sha");
  if (!existsSync(stampFile)) {
    return "dev";
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
