import { describe, expect, it, vi } from "vitest";

// 컬렉션명이 환경을 잘못 타면 staging 데이터가 production 컬렉션에 섞이거나
// 그 반대가 될 수 있다 — APP_ENV별로 정확히 갈리는지가 이 파일의 유일한 계약이다.
describe("VECTOR_SPACE_COLLECTION", () => {
  it("production은 접미사 없이 컬렉션명을 쓴다", async () => {
    vi.resetModules();
    vi.doMock("@server/env", () => ({
      getEnv: () => ({ APP_ENV: "production" }),
    }));
    const { VECTOR_SPACE_COLLECTION } = await import("./collections");
    expect(VECTOR_SPACE_COLLECTION.digest).toBe("digests");
  });

  it.each(["staging", "local"] as const)(
    "%s는 -staging 접미사를 쓴다",
    async (appEnv) => {
      vi.resetModules();
      vi.doMock("@server/env", () => ({ getEnv: () => ({ APP_ENV: appEnv }) }));
      const { VECTOR_SPACE_COLLECTION } = await import("./collections");
      expect(VECTOR_SPACE_COLLECTION.digest).toBe("digests-staging");
    },
  );
});
