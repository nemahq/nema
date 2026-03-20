import { resolve } from "node:path";

import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import mdx from "@mdx-js/rollup";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  define: {
    __COMMIT_SHA__: JSON.stringify(process.env.RAILWAY_GIT_COMMIT_SHA ?? "dev"),
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
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: "Nema",
        short_name: "Nema",
        description: "AI-powered context management",
        start_url: "/",
        display: "standalone",
        theme_color: "#0D9488",
        background_color: "#ffffff",
        // TODO: 앱 아이콘 추가 후 manifest.icons 설정
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
