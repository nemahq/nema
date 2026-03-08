import { resolve } from "node:path";

import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    { enforce: "pre", ...mdx({ remarkPlugins: [remarkGfm] }) },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
    tailwindcss(),
    VitePWA({
      // TODO: 캐시 전략 도입 시 'prompt'로 전환 검토
      registerType: "autoUpdate",
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
  ],
  resolve: {
    alias: {
      "@web": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
