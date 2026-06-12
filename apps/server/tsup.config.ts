import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "tsup";

// CI는 railway up(파일 업로드)으로 배포해 Railway 빌더에 git 변수가 없다.
// CI가 저장소 루트에 스탬프한 .commit-sha 파일이 유일한 커밋 정보원.
function resolveCommitSha(): string {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return process.env.RAILWAY_GIT_COMMIT_SHA;
  }
  const stampFile = resolve(__dirname, "../../.commit-sha");
  if (existsSync(stampFile)) {
    return readFileSync(stampFile, "utf8").trim();
  }
  return "dev";
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
