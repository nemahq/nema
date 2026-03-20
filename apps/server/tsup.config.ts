import { defineConfig } from "tsup";

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
    __COMMIT_SHA__: JSON.stringify(process.env.RAILWAY_GIT_COMMIT_SHA ?? "dev"),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
});
