import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  noExternal: ["@nema-io/shared"],
  splitting: false,
  sourcemap: true,
});
