import { describe, expect, it, vi } from "vitest";

// 컬렉션명이 환경을 잘못 타면 staging 데이터가 production 컬렉션에 섞이거나
// 그 반대가 될 수 있다 — APP_ENV별로 정확히 갈리는지가 이 파일의 유일한 계약이다.
describe("collectionNameFor", () => {
  it("production은 접미사 없이 컬렉션명을 쓴다", async () => {
    vi.resetModules();
    vi.doMock("@server/env", () => ({
      getEnv: () => ({ APP_ENV: "production" }),
    }));
    const { collectionNameFor } = await import("./collections");
    expect(collectionNameFor("digest")).toBe("digests");
  });

  it.each(["staging", "local"] as const)(
    "%s는 -staging 접미사를 쓴다",
    async (appEnv) => {
      vi.resetModules();
      vi.doMock("@server/env", () => ({ getEnv: () => ({ APP_ENV: appEnv }) }));
      const { collectionNameFor } = await import("./collections");
      expect(collectionNameFor("digest")).toBe("digests-staging");
    },
  );

  // 이 테스트가 지키는 계약: collectionNameFor는 호출 시점에만 getEnv()를 불러야
  // 한다. 모듈을 import만 하고 아직 호출 안 했을 때 getEnv()가 불리면(=상수로
  // 즉시 계산하면) loadEnv() 이전에 getEnv()가 불려 부팅이 죽는다(2026-08-13
  // staging incident) — import 자체만으로는 getEnv 모킹이 없어도 에러가 나면
  // 안 된다.
  it("모듈을 import하는 것만으로는 getEnv()를 부르지 않는다", async () => {
    vi.resetModules();
    const getEnv = vi.fn(() => {
      throw new Error("loadEnv() must be called before getEnv()");
    });
    vi.doMock("@server/env", () => ({ getEnv }));

    await expect(import("./collections")).resolves.toBeDefined();
    expect(getEnv).not.toHaveBeenCalled();
  });
});
