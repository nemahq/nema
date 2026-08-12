import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  // @nema-io/shared는 raw TS 소스를 내보낸다(루트 CLAUDE.md) — 번들에 인라인하지
  // 않으면(default: external) 런타임이 workspace 심링크를 따라가 .ts 확장자 없는
  // import를 그대로 만나 Node ESM 로더에서 깨진다.
  noExternal: ["@nema-io/shared"],
  splitting: false,
  sourcemap: true,
});
