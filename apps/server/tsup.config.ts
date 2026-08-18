import { defineConfig } from "tsup";

export default defineConfig({
  // instrument.ts는 별도 엔트리다 — Sentry가 다른 모듈보다 먼저 로드돼야 계측이
  // 걸린다(start 스크립트가 --import로 index.ts보다 먼저 불러온다).
  entry: ["src/index.ts", "src/instrument.ts"],
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
