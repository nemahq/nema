import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

// 커밋 SHA: RAILWAY_GIT_COMMIT_SHA(repo 연동 배포 대비) → CI가 railway up 직전
// 스탬프한 .commit-sha. 스탬프 존재 = 배포 빌드 신호 (CI→Railway 빌드엔 업로드된
// 파일만 건너오고, RAILWAY_* 변수는 빌드 단계에 주입되지 않는다). 로컬은 항상 dev.
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
  define: {
    __COMMIT_SHA__: JSON.stringify(resolveCommitSha()),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("date-fns")) {
              return "date-fns";
            }
            if (id.includes("@tanstack")) {
              return "tanstack";
            }
          }
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@web": resolve(__dirname, "src"),
    },
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/trpc": {
        target:
          process.env.VITE_DEV_API_TARGET ??
          `http://localhost:${process.env.VITE_SERVER_PORT ?? 3001}`,
        changeOrigin: true,
      },
    },
  },
});
