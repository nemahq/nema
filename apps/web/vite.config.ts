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
