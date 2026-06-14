import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import mdx from "@mdx-js/rollup";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const MAX_CACHE_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

// 커밋 SHA 우선순위: RAILWAY_GIT_COMMIT_SHA(repo 연동 배포로 되돌아갈 경우 대비)
// → CI가 railway up 직전 저장소 루트에 스탬프한 .commit-sha 파일.
// 스탬프 존재 자체가 "배포 빌드" 신호다. CI→Railway 빌드로 건너오는 건 업로드된
// 파일뿐이라 가장 확실하고, 어떤 환경변수에도 의존하지 않는다. (RAILWAY_* 변수는
// railway up 빌드 단계에 주입되지 않아 신호로 쓸 수 없다.) 로컬 빌드는 스탬프가
// 없으니 항상 dev.
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
    { enforce: "pre", ...mdx({ remarkPlugins: [remarkGfm] }) },
    react({
      include: /\.(jsx|tsx|mdx)$/,
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
    VitePWA({
      // TODO: 캐시 전략 도입 시 'prompt'로 전환 검토
      registerType: "autoUpdate",
      workbox: {
        maximumFileSizeToCacheInBytes: MAX_CACHE_FILE_SIZE_BYTES,
      },
      manifest: {
        name: "Nema",
        short_name: "Nema",
        description: "Forget freely. Nema remembers",
        start_url: "/",
        display: "standalone",
        theme_color: "#0D9488",
        background_color: "#1c1917",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    }),
    sentryVitePlugin({
      org: "nema-o7",
      project: "nema-web",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
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
